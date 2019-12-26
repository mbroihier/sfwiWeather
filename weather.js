// weather display server - displays current local weather information
// Setup all required packages
// Although the next line refers to jslint, it is altering jshint behavior
/*jslint esversion:6 */
/*jslint node:true, maxerr:50  */
'use strict';
process.env.TZ = 'US/Central';
var config = require("./config.js");
var express = require("express");
var fs = require("fs");
var jsdom = require("jsdom");
var WebSocketServer = require("ws").Server;
// Read main html page - this will be parsed later
var mainPageContents = fs.readFileSync("./index.html");
var app = express();

var https = require("https");

var JSONObject = null;
var AlertObject = null;
var updateInProgress = false;
var updateAlertInProgress = false;
var radarUpdateInProgress = false;
var buildHTML = false;
var temperatureRange = {};
var dayArray = ["Sun ", "Mon ", "Tue ", "Wed ", "Thu ", "Fri ", "Sat "];
var radarImages = [];
var headlines = [];

for (let day of dayArray) {
    for (let hour=0; hour < 24; hour++) {
	temperatureRange[day + ((hour < 10)? "0":"") + hour + ":00"] = "";
    }
}

var updateJSONObject = function () {
    if (updateInProgress || radarUpdateInProgress) {
	console.log("exiting update - update is in progress");
	return;
    }
    updateInProgress = true;
    radarUpdateInProgress = true;
    console.log("Updating JSON object using ", config.forecastURL, config.forecastPath);
    let query = https.request({ protocol: "https:", hostname: config.forecastURL, path: config.forecastPath, port: 443, method: "GET", headers: {'User-Agent' : "mbroihier@yahoo.com", "Accept" : "application/geo+json"}}, function (result) {
	let bodySegments = [];
	result.on("data", function (data) {
	    //console.log("Got some data from api");
	    bodySegments.push(data);
	});

	result.on("end", function () {
	    let body = Buffer.concat(bodySegments);
            let replyDOM = new jsdom.JSDOM(body);
	    //console.log("Response from query:"+replyDOM.serialize());
	    let replyDocument = replyDOM.window.document;
	    //console.log("Document portion:", replyDocument.body.textContent);
	    try {
		let replyJSON = JSON.parse(replyDocument.body.textContent); // make JSON object
                if ("properties" in replyJSON) { // only update if there is information
                    JSONObject = replyJSON;
                } else {
                    console.log("Error in forecast request - skip a period");
                    console.log(replyJSON);
	            lastUpdateTime = new Date();
                    if (radarUpdateInProgress == false) {
                        buildHTML = true;
                    }
                }
	    } catch (err) {
		console.log("Error while parsing weather data reply:", err);
	    }
	    if (JSONObject != null && "properties" in JSONObject) {
		for (let forecastObject of JSONObject.properties.periods) {
		    let rowTS = new Date(forecastObject.startTime);
		    forecastObject.innerHTML = dayArray[rowTS.getDay()] + ((rowTS.getHours() < 10) ? "0":"") + rowTS.getHours() + ":" + ((rowTS.getMinutes() < 10) ? "0" : "") + rowTS.getMinutes();
		}
		lastUpdateTime = new Date();
		let currentDay = dayArray[(new Date()).getDay()];
		for (let index=0; index < JSONObject.properties.periods.length; index++ ) { // find min / max temperature for the day
		    if (JSONObject.properties.periods[index].innerHTML.includes(currentDay)) {
			//console.log("Skipping", currentDay);;
		    } else {
			let lowTemp = null;
			let highTemp = null;
			let foundIndexLow = 0;
			let foundIndexHigh = 0;
			//console.log("Processing", JSONObject.properties.periods[index].innerHTML);
			for (let trIndex=index; (trIndex < index+24) && (trIndex < JSONObject.properties.periods.length); trIndex++) {
			    //console.log("Periods index",trIndex);
			    let temperatureOfInterest = parseInt(JSONObject.properties.periods[trIndex].temperature);
			    if (lowTemp == null) {
				lowTemp = temperatureOfInterest;
			    } else if (lowTemp > temperatureOfInterest) {
				lowTemp = temperatureOfInterest;
				foundIndexLow = trIndex;
			    }
			    if (highTemp == null) {
				highTemp = temperatureOfInterest;
			    } else if (highTemp < temperatureOfInterest) {
				highTemp = temperatureOfInterest;
				foundIndexHigh = trIndex;
			    }
			}
			for (let trIndex=index; (trIndex < index+24) && (trIndex < JSONObject.properties.periods.length); trIndex++) {
			    if (foundIndexLow > foundIndexHigh) {
				temperatureRange[JSONObject.properties.periods[trIndex].innerHTML] = "" + highTemp + "\xB0/" + lowTemp + "\xB0";
			    } else {
				temperatureRange[JSONObject.properties.periods[trIndex].innerHTML] = "" + lowTemp + "\xB0/" + highTemp + "\xB0";
			    }
			}
			index = index + 23; // advance to next day
		    }
		}
		//console.log(temperatureRange);
		updateInProgress = false;
		if (radarUpdateInProgress == false) {
		    buildHTML = true;
		}
		console.log("Successful update of JSON object");
	    } else {
		updateInProgress = false;
		console.log("failed to update JSON object");
	    }
	});
	result.on("error", function(){
	    console.log("query error on result path");
	    updateInProgress = false;
	    if (radarUpdateInProgress == false) {
		buildHTML = true;
	    }
	    console.log("Update of JSON object failed");
	});

    });
    query.on("error", function(error) {
	console.log("query error: " + error);
	updateInProgress = false;
        if (radarUpdateInProgress == false) {
            buildHTML = true;
	}
	console.log("Update of JSON object failed");
    });
    query.end();
    let ftpClient = https.request({ protocol: "https:", hostname: "radar.weather.gov", path: "/RadarImg/NCR/" + config.radarStation + "/", port: 443, method: "GET", headers: {'User-Agent' : "mbroihier@yahoo.com"}}, function (result) {
	let bodySegments = [];
	result.on("data", function (data) {
	    //console.log("Got some data from api");
	    bodySegments.push(data);
	});

	result.on("end", function () {
	    let body = Buffer.concat(bodySegments);
            let replyDOM = new jsdom.JSDOM(body);
	    //console.log("Response from query:"+replyDOM.serialize());
	    let replyDocument = replyDOM.window.document;
	    //console.log("Document portion:", replyDocument.body.textContent);
            let tds = replyDocument.querySelectorAll("td");
	    for (let td of tds) {
		let anchors = td.getElementsByTagName("a");
		if (anchors.length > 0) {
                    if (! anchors[0].innerHTML.includes("Parent") ) {
		        radarImages.push(anchors[0].innerHTML);
		        if (radarImages.length > 10) {
			    radarImages.shift();
		        }
                    }
		}
	    }
	    radarUpdateInProgress = false;
	    if (updateInProgress == false) {
		buildHTML = true;
	    }
	    console.log("Successful update of radar images");
	    //console.log(radarImages);
	});
    });
    ftpClient.on("error", function(error) {
	radarUpdateInProgress = false;
	if (updateInProgress == false) {
	    buildHTML = true;
	}
	console.log("ftp query error", error);
    });
    ftpClient.end();
};

var mainPageDOM = null;
var next12Hours = {};
var lastRecordedHour = 0;
var historicalTemp = [];

var updateAlertInformation = function () {
    if (updateAlertInProgress) {
        console.log("exiting alert update - update is in progress");
        return;
    }
    updateAlertInProgress = true;
    console.log("Updating alert information using ", config.forecastURL, config.zone);
    let query = https.request({ protocol: "https:", hostname: config.forecastURL, path: "/alerts/active/zone/" + config.zone, port: 443, method: "GET", headers: {'User-Agent' : "mbroihier@yahoo.com", "Accept" : "application/geo+json"}}, function (result) {
	let bodySegments = [];
	result.on("data", function (data) {
	    //console.log("Got some data from api");
	    bodySegments.push(data);
	});

	result.on("end", function () {
	    let body = Buffer.concat(bodySegments);
            let replyDOM = new jsdom.JSDOM(body);
	    //console.log("Response from query:"+replyDOM.serialize());
	    let replyDocument = replyDOM.window.document;
	    //console.log("Document portion:", replyDocument.body.textContent);
	    try {
		let replyJSON = JSON.parse(replyDocument.body.textContent); // make JSON object
                if ("features" in replyJSON) { // only update if there is information
                    AlertObject = replyJSON;
                } else {
                    console.log("Error in alert request - skip a period");
                    console.log(replyJSON);
                }
	    } catch (err) {
		console.log("Error while parsing alert data reply:", err);
	    }
	    if (AlertObject != null && "features" in AlertObject) {
                headlines = [];
                
		for (let feature of AlertObject.features) {
                    headlines.push(feature.properties.headline);
                }
		updateAlertInProgress = false;
		console.log("Successful update of alert information");
                lastAlertUpdateTime = new Date();
                buildHTML = true;
	    } else {
		updateAlertInProgress = false;
		console.log("failed to update alert information");
	    }
	});
	result.on("error", function(){
	    console.log("alert query error on result path");
	    updateAlertInProgress = false;
	    console.log("Update of alert information failed");
	});

    });
    query.on("error", function(error) {
	console.log("query error: " + error);
	updateAlertInProgress = false;
	console.log("Update of alert information failed");
    });
    query.end();
};

var updateHTML = function () {
    console.log("Updating HTML");
    let dom = new jsdom.JSDOM(mainPageContents);
    let insertionPoint = dom.window.document.querySelector("#alertTable");
    for (let headline of headlines) {
        let tableRow = dom.window.document.createElement("tr");
        let tableCell = dom.window.document.createElement("td");
	tableCell.innerHTML = headline;
	tableRow.appendChild(tableCell);
	insertionPoint.appendChild(tableRow);
    }
    // fill in forecast table and estimate temperature at time of table generation
    insertionPoint = dom.window.document.querySelector("#forecastTable");
    let count = 0;
    if (JSONObject != null && "properties" in JSONObject) {
        let tempPlotData ='var reviver = function(name, value) { if (name === \'0\') { value = new Date(value); } return value;}; var collectedData = JSON.parse(\'{ "temperature" : ';
        let currentDay = dayArray[(new Date()).getDay()];
        for (let forecastObject of JSONObject.properties.periods) {
	    if ((count < 24) && forecastObject.innerHTML.includes(currentDay)) {
	        let tableRow = dom.window.document.createElement("tr");
                if ((count % 2) == 0) {
	            tableRow.setAttribute('style', 'display:show');
                } else {
	            tableRow.setAttribute('style', 'display:none');
                    tableRow.setAttribute('class', 'hide');
                }
                let tableCellDate = dom.window.document.createElement("td");
	        tableCellDate.innerHTML = forecastObject.innerHTML;
	        tableRow.appendChild(tableCellDate);
	        let tableCellTemp = dom.window.document.createElement("td");
	        tableCellTemp.innerHTML = forecastObject.temperature;
	        tableCellTemp.setAttribute('style', 'text-align:center');
	        tableRow.appendChild(tableCellTemp);
	        let tableCellWind = dom.window.document.createElement("td");
	        tableCellWind.innerHTML = forecastObject.windSpeed;
	        tableRow.appendChild(tableCellWind);
	        let tableCellDesc = dom.window.document.createElement("td");
	        tableCellDesc.innerHTML = forecastObject.shortForecast;
	        tableRow.appendChild(tableCellDesc);
	        insertionPoint.appendChild(tableRow);
	    } else {
	        let tableRow = dom.window.document.createElement("tr");
	        if ( forecastObject.innerHTML.includes('10:00') ||
                     forecastObject.innerHTML.includes('12:00') ||
                     forecastObject.innerHTML.includes('14:00') ||
                     forecastObject.innerHTML.includes('16:00') ||
                     forecastObject.innerHTML.includes('18:00') ) {
		    tableRow.setAttribute('style', 'display:show');
	        } else {
                    tableRow.setAttribute('style', 'display:none');
                    tableRow.setAttribute('class', 'hide');
	        }		
	        let tableCellDate = dom.window.document.createElement("td");
	        tableCellDate.innerHTML = forecastObject.innerHTML;
	        tableRow.appendChild(tableCellDate);
	        let tableCellTemp = dom.window.document.createElement("td");
	        tableCellTemp.innerHTML = forecastObject.temperature;
	        tableCellTemp.setAttribute('style', 'text-align:center');
	        tableRow.appendChild(tableCellTemp);
	        let tableCellWind = dom.window.document.createElement("td");
	        tableCellWind.innerHTML = forecastObject.windSpeed;
	        tableRow.appendChild(tableCellWind);
	        let tableCellDesc = dom.window.document.createElement("td");
	        tableCellDesc.innerHTML = forecastObject.shortForecast;
	        tableRow.appendChild(tableCellDesc);
	        insertionPoint.appendChild(tableRow);
	    }

	    if (count < 24) {
	        if (count == 0) {
		    tempPlotData += "[[";
	        } else {
		    tempPlotData += ",[";
	        }
                let startTime = (new Date(forecastObject.startTime)).getTime();
	        tempPlotData += startTime + ',';
	        tempPlotData += forecastObject.temperature + ']';
                if (count === 0) {
	            tempPlotData += ",[" +startTime + ','; // add an extra start point - plot weirdness
	            tempPlotData += forecastObject.temperature + ']';
                    if (startTime != lastRecordedHour) {
                        if (lastRecordedHour === 0 ) { //first time
                            for (let lRHIndex = 5; lRHIndex >= 0; lRHIndex -= 1) {
                                historicalTemp.push([startTime - lRHIndex*3600000, forecastObject.temperature]);
                            }
                        } else {
                            historicalTemp.push([startTime, forecastObject.temperature]);
                        }
                        lastRecordedHour = startTime;
                    }
                    if (historicalTemp.length > 6) {
                        historicalTemp.shift();
                    }
                    console.log(historicalTemp);
                }
	    }
	    count += 1;
        }
        tempPlotData += "], \"oldTemperature\": ";
        count = 0;
        for (let oldSample of historicalTemp) {
            if (count == 0) {
	        tempPlotData += "[[";
	    } else {
	        tempPlotData += ",[";
	    }
            tempPlotData += oldSample[0] + "," + oldSample[1] + "]";
            count += 1;
        }
        tempPlotData += "]}',reviver);";
        console.log (tempPlotData);
        fs.writeFileSync("./plot_data.js", tempPlotData);
        let temperature = JSONObject.properties.periods[0].temperature;
        let windSpeed = JSONObject.properties.periods[0].windSpeed;
        let direction = JSONObject.properties.periods[0].windDirection;
        let asciiTemperature = temperature + "\xB0F";
        let elements = dom.window.document.querySelectorAll("p");
        for (let element of elements) {
	    if (element.getAttribute('name') == 'temperature') {
	        element.innerHTML = asciiTemperature;
	    } else if (element.getAttribute('name') == 'description') {
	        element.innerHTML = JSONObject.properties.periods[0].shortForecast;
	    } else if (element.getAttribute('name') == 'wind') {
	        element.innerHTML = direction + " @ " + windSpeed;
	    } else if (element.getAttribute('name') == 'time') {
	        let dateString = new Date().toString();
	        element.innerHTML = pattern.exec(dateString)[0];
	    } else if (element.getAttribute('name') == 'range') {
	        element.innerHTML = temperatureRange[dayArray[(new Date()).getDay()]+"00:00"];
	    }
        }
        insertionPoint = dom.window.document.querySelector("#radar");
        count = 0;
        for (let image of radarImages) {
	    let radarImage = dom.window.document.createElement("img");
	    radarImage.setAttribute("id", "frame"+count);
	    radarImage.setAttribute("class", "radarOverlay");
	    radarImage.setAttribute("src", "https://radar.weather.gov/ridge/RadarImg/NCR/" + config.radarStation + "/"+image);
	    insertionPoint.appendChild(radarImage);
	    count++;
        }
    }
    mainPageDOM = dom;
    buildHTML = false;
    console.log("HTML ready");
};

var lastUpdateTime = null;
var lastAlertUpdateTime = null;

// initialize global information

var FORECAST_INTERVAL = 600000;
var ALERT_INTERVAL    = 120000;

var debug = false;

var firstTime = true;

var pattern = /[^:]+:\d\d/;

// check for changes 
setInterval(function(){
    let delta = new Date() - lastUpdateTime;
    let alertDelta = new Date() - lastAlertUpdateTime;
    if (delta > FORECAST_INTERVAL) {
	updateJSONObject();
    }
    if (alertDelta > ALERT_INTERVAL) {
        updateAlertInformation();
    }
    if (buildHTML) {
        updateHTML();
    }
},1000);
// if the express server is contacted, look at the request and build a response or
// forward the request to the standard server behavior.
app.get("/", function(request, response, next) {

    console.log("processing /index.html");
    console.log(request.url);
    console.log(request.method);
    // this is the main page so return main page built in updateHTML
    //updateAlertInformation();
    response.send(mainPageDOM.serialize());
});
// post processing section
// default processing section
app.get("*", function(request, response, next) {
    console.log("fell into default get");
    console.log(request.url);
    console.log(request.method);
    next();
  });
app.post("*", function(request, response, next) {
    console.log("fell into default post");
    console.log(request.url);
    console.log(request.method);
    next();
  });
app.use(express.static("./"));
var ws = new WebSocketServer({server: app.listen(process.env.PORT || 3000)});
console.log("weather server is listening");
