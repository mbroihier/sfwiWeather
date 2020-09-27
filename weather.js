// weather display server - displays current local weather information
// Setup all required packages
// Although the next line refers to jslint, it is altering jshint behavior
/*jslint esversion:6 */
/*jslint node:true, maxerr:50  */
'use strict';
var config = require("./config.js");
var express = require("express");
var fs = require("fs");
var jsdom = require("jsdom");
process.env.TZ = config.timeZone;
var WebSocketServer = require("ws").Server;
// Read main html page - this will be parsed later
var mainPageContents = fs.readFileSync("./index.html");
var app = express();

var http = require("http");
var https = require("https");

var JSONObject = null;
var observedJSONObjectForecasts = {temperature: {}, windSpeed: {}, windDirection: {}, shortForecast: {}, lowTemp: {}, highTemp: {}, foundIndexLow: {}, foundIndexHigh: {}, temperatureRange: {}};
var displayObject = {};
var AlertObject = null;
var updateInProgress = false;
var updateAlertInProgress = false;
var radarUpdateInProgress = false;
var buildHTML = false;
var dayArray = ["Sun ", "Mon ", "Tue ", "Wed ", "Thu ", "Fri ", "Sat "];
var directionSymbol = {"N": "&#x2191;", "S" : "&#x2193;", "E" : "&#x2192;", "W" : "&#x2190;",
                       "NE" : "&#x2197;", "NW" : "&#x2196;", "SE" : "&#x2198;", "SW" : "&#x2199;",
                       "NNE" : "&#x2197;", "NNW" : "&#x2196;", "SSE" : "&#x2198;", "SSW" : "&#x2199;",
                       "WNW" : "&#x2196;", "WSW" : "&#x2199;", "ENE" : "&#x2197;", "ESE" : "&#x2198;"};
var radarImages = [];
var headlines = [];
var emulatorTime = null;
var lastForecastStartTime = null;
var fileName = "";

var validateAPIForecast = function(candidateObject) {
    let status = "properties" in candidateObject && "periods" in candidateObject.properties && candidateObject.properties.periods.length > 0;
    if (status) { //if initial checks good, look at data ranges
        for (let forecastObject of candidateObject.properties.periods) {
            status &= "startTime" in forecastObject;
            status &= "temperature" in forecastObject;
            status &= "windSpeed" in forecastObject;
            status &= "windDirection" in forecastObject;
            status &= "shortForecast" in forecastObject;
            if (status) {
                status &= parseInt(forecastObject.temperature) > -200 && parseInt(forecastObject.temperature) < 200; // limit temperature
                status &= parseInt(forecastObject.windSpeed) >= 0 && parseInt(forecastObject.windSpeed) < 300; // limit wind
            }
            if (! status) {
                console.log("Validation failed:", forecastObject);
                break;
            }
        }
        if (status) {
            if (lastForecastStartTime == null) {
                lastForecastStartTime = new Date(candidateObject.properties.periods[0].startTime);
            } else {
                let firstTableEntryTime = new Date(candidateObject.properties.periods[0].startTime);
                if (firstTableEntryTime < lastForecastStartTime) {
                    console.log("Received an older forecast than others that have been received -- rejecting");
                    status = false;
                } else {
                    lastForecastStartTime = firstTableEntryTime;
                }
            }
        }
    }
    return status;
};

var validateAPIAlerts = function(candidateObject) {
    let status = "features" in candidateObject && candidateObject.features.length >0 && "properties" in candidateObject.features[0] && "headline" in candidateObject.features[0].properties;
    if (status) {
        for (let feature of candidateObject.features) {
            status &= "properties" in feature && "headline" in feature.properties;
            if (!status) {
                break;
            }
        }
    } else {
        status = "features" in candidateObject && candidateObject.features.length == 0; // no alerts, this is ok
    }
    return status;
};

var timePortal = function() {
    let returnTime = null;
    if (emulatorTime != null) {
        returnTime = new Date(emulatorTime);
        //console.log("timePortal: ", returnTime, dayArray[returnTime.getDay()], returnTime.getHours(), returnTime.getMinutes());
    } else {
        returnTime = new Date();
    }
    return returnTime;
};

var updateJSONObject = function () {
    if (updateInProgress || radarUpdateInProgress) {
	console.log("exiting update - update is in progress");
	return;
    }
    updateInProgress = true;
    radarUpdateInProgress = true;
    console.log("Updating JSON object using ", config.forecastURL, config.forecastPath);
    let queryType = null;
    if (config.protocol == "https:") {
        queryType = https;
    } else {
        queryType = http;
    }
    let query = queryType.request({ protocol: config.protocol, hostname: config.forecastURL, path: config.forecastPath, port: config.port, method: "GET", headers: {'User-Agent' : "mbroihier@yahoo.com", "Accept" : "application/geo+json"}}, function (result) {
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
                if (validateAPIForecast(replyJSON)) { // only update if there is valid information
                    JSONObject = replyJSON;
                    let targetTS = new Date(JSONObject.properties.periods[0].startTime);
                    for (let index=0; index < JSONObject.properties.periods.length; index++) {  // copy what we want to linger
                        observedJSONObjectForecasts.temperature[targetTS] = JSONObject.properties.periods[index].temperature;
                        observedJSONObjectForecasts.windSpeed[targetTS] = JSONObject.properties.periods[index].windSpeed;
                        observedJSONObjectForecasts.windDirection[targetTS] = JSONObject.properties.periods[index].windDirection;
                        observedJSONObjectForecasts.shortForecast[targetTS] = JSONObject.properties.periods[index].shortForecast;
                        targetTS = new Date(targetTS.getTime() + TABLE_TIME_INCREMENT);
                    }
                    if ("emulatorTime" in JSONObject) {
                        emulatorTime = JSONObject["emulatorTime"];
                    }
                    if ("fileName" in JSONObject) {
                        fileName = JSONObject["fileName"];
                    }
                    let staleThreshold = timePortal() - OLDEST_ALLOWED_DATA;
                    for (let entry in observedJSONObjectForecasts.temperature) {  // eliminate stale data
                        if (new Date(entry) < staleThreshold) {
                            delete observedJSONObjectForecasts.temperature[entry];
                            delete observedJSONObjectForecasts.windSpeed[entry];
                            delete observedJSONObjectForecasts.windDirection[entry];
                            delete observedJSONObjectForecasts.shortForecast[entry];
                        }
                    }
                    // console.log(observedJSONObjectForecasts);
		    lastUpdateTime = timePortal();
                    let objectIndex = new Date(timePortal() - (timePortal() % (3600*1000)));
                    let isCurrentDay = true;
		    while (objectIndex in observedJSONObjectForecasts.temperature) {
                        let lowTemp = null;
                        let highTemp = null;
                        let foundIndexLow = 0;
                        let foundIndexHigh = 0;
                        let workingHour = objectIndex.getHours();
                        let listOfObjects = [];
                        if (isCurrentDay && (objectIndex in observedJSONObjectForecasts.temperatureRange)) {
                            // if we are processing information for the current day, let lows float lower and highs
                            // rise higher, but don't start from scratch
                            lowTemp = observedJSONObjectForecasts.lowTemp[objectIndex];
                            highTemp = observedJSONObjectForecasts.highTemp[objectIndex];
                            foundIndexLow = observedJSONObjectForecasts.foundIndexLow[objectIndex];
                            foundIndexHigh = observedJSONObjectForecasts.foundIndexHigh[objectIndex];
                            isCurrentDay = false;
                        }
                        let temperatureOfInterest;
                        do  {
                            temperatureOfInterest = parseInt(observedJSONObjectForecasts.temperature[objectIndex]);
                            if (lowTemp == null) {
                                lowTemp = temperatureOfInterest;
                            } else if (lowTemp > temperatureOfInterest) {
	                        lowTemp = temperatureOfInterest;
                                foundIndexLow = workingHour;
                            }
                            if (highTemp == null) {
	                        highTemp = temperatureOfInterest;
	                    } else if (highTemp < temperatureOfInterest) {
                                highTemp = temperatureOfInterest;
                                foundIndexHigh = workingHour;
                            }
                            listOfObjects.push(objectIndex.toString());
                            objectIndex = new Date(objectIndex.getTime() + TABLE_TIME_INCREMENT);
                            workingHour = objectIndex.getHours();
                        } while ((workingHour != 0) && (objectIndex in observedJSONObjectForecasts.temperature));
                        let rangeText = (foundIndexLow > foundIndexHigh)  ? ("" + highTemp + "\xB0/" + lowTemp + "\xB0") : ("" + lowTemp + "\xB0/" + highTemp + "\xB0");
                        for (let backFillIndex of listOfObjects) {
                            observedJSONObjectForecasts.lowTemp[backFillIndex] = lowTemp;
                            observedJSONObjectForecasts.highTemp[backFillIndex] = highTemp;
                            observedJSONObjectForecasts.foundIndexLow[backFillIndex] = foundIndexLow;
                            observedJSONObjectForecasts.foundIndexHigh[backFillIndex] = foundIndexHigh;
                            observedJSONObjectForecasts.temperatureRange[backFillIndex] = rangeText;
                        }
                    }
                    //console.log(observedJSONObjectForecasts);
                    if (radarUpdateInProgress == false) {
                        buildHTML = true;
                    }
                    console.log("Successful update of JSON object");
                } else {
                    console.log("Error in forecast request did not validate - skipping a period");
                    console.log(replyJSON);
                    lastUpdateTime = timePortal();
                    if (radarUpdateInProgress == false) {
                        buildHTML = true;
                    }
                }
	    } catch (err) {
		console.log("Error while parsing weather forecast data - not updating JSON object- reply:", err);
	        lastUpdateTime = timePortal();
	    }
            updateInProgress = false;
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
        if (emulatorTime != null) {
            process.exit(1);
        }
    });
    query.on("close", function(error) {
        if (updateInProgress) {
            console.log("close before end - query error: " + error);
            updateInProgress = false;
            if (radarUpdateInProgress == false) {
                buildHTML = true;
	    }
	    console.log("Update of JSON object failed");
            if (emulatorTime != null) {
                // do nothing - this appears to be the API emulator running out of queue space (5 pending requests)
                //process.exit(1);
            }
        }
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
    ftpClient.on("close", function(error) {
        if (radarUpdateInProgress) {
	    radarUpdateInProgress = false;
	    if (updateInProgress == false) {
	        buildHTML = true;
	    }
	    console.log("close before end - ftp query error", error);
        }
    });
    ftpClient.end();
};

var mainPageDOM = null;
var next12Hours = {};
var historicalTemp = [];

var updateAlertInformation = function () {
    if (updateAlertInProgress) {
        console.log("exiting alert update - update is in progress");
        return;
    }
    updateAlertInProgress = true;
    console.log("Updating alert information using ", config.forecastURL, config.zone);
    let queryType = null;
    if (config.protocol == "https:") {
        queryType = https;
    } else {
        queryType = http;
    }
    let query = queryType.request({ protocol: config.protocol, hostname: config.forecastURL, path: "/alerts/active/zone/" + config.zone, port: config.port, method: "GET", headers: {'User-Agent' : "mbroihier@yahoo.com", "Accept" : "application/geo+json"}}, function (result) {
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
                fs.writeFileSync("/tmp/alertDebug", replyDocument.body.textContent, {flag:"a"});
                fs.writeFileSync("/tmp/alertDebug", " resets = " + resets + "\n", {flag:"a"});
                if (validateAPIAlerts(replyJSON)) { // only update if valid
                    AlertObject = replyJSON;
                    headlines = [];
		    for (let feature of AlertObject.features) {
                        headlines.push(feature.properties.headline);
                    }
		    console.log("Successful update of alert information");
                    buildHTML = true;
                } else {
                    console.log("Error in alert request - validation failed - skip a period");
                    console.log(replyJSON);
                }
		updateAlertInProgress = false;
                lastAlertUpdateTime = timePortal();
	    } catch (err) {
		console.log("Error while parsing alert data reply - skip a period:", err);
		updateAlertInProgress = false;
                lastAlertUpdateTime = timePortal();
	        console.log("Update of alert information failed");
	    }
	});
	result.on("error", function(){
	    console.log("alert query error on result path");
	    updateAlertInProgress = false;
            lastAlertUpdateTime = timePortal();
	    console.log("Update of alert information failed");
	});

    });
    query.on("close", function(error) {
        if (updateAlertInProgress) {
	    console.log("closing before processing - query error: " + error);
	    updateAlertInProgress = false;
            lastAlertUpdateTime = timePortal();
	    console.log("Update of alert information failed");
        }
    });
    query.on("error", function(error) {
	console.log("query error: " + error);
	updateAlertInProgress = false;
        lastAlertUpdateTime = timePortal();
	console.log("Update of alert information failed");
    });
    query.end();
};

var updateHTML = function () {
    console.log("Updating HTML");
    let dom = new jsdom.JSDOM(mainPageContents);
    let insertionPoint = dom.window.document.querySelector("#alertTable");
    let noAlertInfo = true;
    for (let headline of headlines) {
        noAlertInfo = false;
        let tableRow = dom.window.document.createElement("tr");
        let tableCell = dom.window.document.createElement("td");
	tableCell.innerHTML = headline;
	tableRow.appendChild(tableCell);
	insertionPoint.appendChild(tableRow);
    }
    if (noAlertInfo) {
        let tableRow = dom.window.document.createElement("tr");
        let tableCell = dom.window.document.createElement("td");
	tableCell.innerHTML = "No alert information.  Last alert information update time: " + lastAlertUpdateTime + " <br>Current update activity status is: " + (updateAlertInProgress ? "Processing" : "Processing Complete" + " <br>Resets: " + resets);
	tableRow.appendChild(tableCell);
	insertionPoint.appendChild(tableRow);
    } else {
        let tableRow = dom.window.document.createElement("tr");
        let tableCell = dom.window.document.createElement("td");
	tableCell.innerHTML = "Last alert information update time: " + lastAlertUpdateTime + " <br>Current update activity status is: " + (updateAlertInProgress ? "Processing" : "Processing Complete" + " <br>Resets: " + resets);
	tableRow.appendChild(tableCell);
	insertionPoint.appendChild(tableRow);
    }
    // fill in forecast table
    insertionPoint = dom.window.document.querySelector("#forecastTable");
    let count = 0;
    if (JSONObject != null && "properties" in JSONObject) {
        let reference = timePortal();
        let objectIndex = new Date(reference.getTime() - (reference.getTime() % (3600*1000)));
        let tempPlotData ='var timeZoneOffset = ' + reference.getTimezoneOffset() + '; var reference = new Date(); var reviver = function(name, value) { if (name === \'0\') { value = new Date(value + (reference.getTimezoneOffset() - timeZoneOffset)*60000);} return value;}; var collectedData = JSON.parse(\'{ "temperature" : ';
        let currentDay = dayArray[reference.getDay()];
        while (objectIndex in observedJSONObjectForecasts.temperature) {
            let tableTimeStamp = dayArray[objectIndex.getDay()] + " " + ((objectIndex.getHours() < 10) ? "0" : "") + objectIndex.getHours() + ":00";
	    if ((count < 24) && (dayArray[objectIndex.getDay()] == currentDay)) {
	        let tableRow = dom.window.document.createElement("tr");
                if ((count % 2) == 0) {
	            tableRow.setAttribute('style', 'display:table-row');
                } else {
	            tableRow.setAttribute('style', 'display:none');
                    tableRow.setAttribute('class', 'hide');
                }
                let tableCellDate = dom.window.document.createElement("td");
	        tableCellDate.innerHTML = tableTimeStamp;
	        tableRow.appendChild(tableCellDate);
	        let tableCellTemp = dom.window.document.createElement("td");
	        tableCellTemp.innerHTML = observedJSONObjectForecasts.temperature[objectIndex];
	        tableCellTemp.setAttribute('style', 'text-align:center');
	        tableRow.appendChild(tableCellTemp);
	        let tableCellWind = dom.window.document.createElement("td");
	        tableCellWind.innerHTML = directionSymbol[observedJSONObjectForecasts.windDirection[objectIndex]] + observedJSONObjectForecasts.windSpeed[objectIndex];
	        tableRow.appendChild(tableCellWind);
	        let tableCellDesc = dom.window.document.createElement("td");
	        tableCellDesc.innerHTML = observedJSONObjectForecasts.shortForecast[objectIndex];
	        tableRow.appendChild(tableCellDesc);
	        insertionPoint.appendChild(tableRow);
	    } else {
	        let tableRow = dom.window.document.createElement("tr");
	        if ( tableTimeStamp.includes('10:00') ||
                     tableTimeStamp.includes('12:00') ||
                     tableTimeStamp.includes('14:00') ||
                     tableTimeStamp.includes('16:00') ||
                     tableTimeStamp.includes('18:00') ) {
		    tableRow.setAttribute('style', 'display:table-row');
	        } else {
                    tableRow.setAttribute('style', 'display:none');
                    tableRow.setAttribute('class', 'hide');
	        }		
	        let tableCellDate = dom.window.document.createElement("td");
	        tableCellDate.innerHTML = tableTimeStamp;
	        tableRow.appendChild(tableCellDate);
	        let tableCellTemp = dom.window.document.createElement("td");
	        tableCellTemp.innerHTML = observedJSONObjectForecasts.temperature[objectIndex];
	        tableCellTemp.setAttribute('style', 'text-align:center');
	        tableRow.appendChild(tableCellTemp);
	        let tableCellWind = dom.window.document.createElement("td");
	        tableCellWind.innerHTML = directionSymbol[observedJSONObjectForecasts.windDirection[objectIndex]] + observedJSONObjectForecasts.windSpeed[objectIndex];
	        tableRow.appendChild(tableCellWind);
	        let tableCellDesc = dom.window.document.createElement("td");
	        tableCellDesc.innerHTML = observedJSONObjectForecasts.shortForecast[objectIndex];
	        tableRow.appendChild(tableCellDesc);
	        insertionPoint.appendChild(tableRow);
	    }

	    if (count < 24) {
	        if (count == 0) {
		    tempPlotData += "[[";
	        } else {
		    tempPlotData += ",[";
	        }
                let startTime = objectIndex.getTime();
	        tempPlotData += startTime + ',';
	        tempPlotData += observedJSONObjectForecasts.temperature[objectIndex] + ']';
                if (count === 0) {
	            tempPlotData += ",[" +startTime + ','; // add an extra start point - plot weirdness
	            tempPlotData += observedJSONObjectForecasts.temperature[objectIndex] + ']';
                }
	    }
            objectIndex = new Date(objectIndex.getTime() + TABLE_TIME_INCREMENT);
	    count += 1;
        }
        objectIndex = new Date(reference.getTime() - (reference.getTime() % (3600*1000)));
        let historicalObjectIndex = new Date(objectIndex - 6 * TABLE_TIME_INCREMENT);
        historicalTemp = [];
        while (historicalObjectIndex <= objectIndex) {
            if (historicalObjectIndex in observedJSONObjectForecasts.temperature) {
                historicalTemp.push([historicalObjectIndex.getTime(), observedJSONObjectForecasts.temperature[historicalObjectIndex]]);
            }
            historicalObjectIndex = new Date(historicalObjectIndex.getTime() + TABLE_TIME_INCREMENT);
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
        //console.log (tempPlotData);
        fs.writeFileSync("./plot_data.js", tempPlotData);
        objectIndex = new Date(reference.getTime() - (reference.getTime() % (3600*1000)));
        let temperature = observedJSONObjectForecasts.temperature[objectIndex];
        let windSpeed = observedJSONObjectForecasts.windSpeed[objectIndex];
        let direction = observedJSONObjectForecasts.windDirection[objectIndex];
        let asciiTemperature = temperature + "\xB0F";
        let elements = dom.window.document.querySelectorAll("p");
        for (let element of elements) {
	    if (element.getAttribute('id') == 'temperature') {
	        element.innerHTML = asciiTemperature;
                displayObject.temperature = asciiTemperature;
	    } else if (element.getAttribute('id') == 'description') {
                element.innerHTML = observedJSONObjectForecasts.shortForecast[objectIndex];
                displayObject.description = observedJSONObjectForecasts.shortForecast[objectIndex];
	    } else if (element.getAttribute('id') == 'wind') {
	        element.innerHTML = direction + " @ " + windSpeed;
                displayObject.wind = direction + " @ " + windSpeed;
	    } else if (element.getAttribute('id') == 'time') {
	        let dateString = timePortal().toString();
	        element.innerHTML = pattern.exec(dateString)[0];
                displayObject.time = pattern.exec(dateString)[0];
	    } else if (element.getAttribute('id') == 'range') {
	        element.innerHTML = observedJSONObjectForecasts.temperatureRange[objectIndex];
                displayObject.range = observedJSONObjectForecasts.temperatureRange[objectIndex];
	    }
        }
        insertionPoint = dom.window.document.querySelector("#radar");
        count = 0;
        for (let image of radarImages) {
	    let radarImage = dom.window.document.createElement("img");
	    radarImage.setAttribute("id", "frame"+count);
	    radarImage.setAttribute("alt", "RadarImage");
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
var resets = 0;

// initialize global information

var FORECAST_INTERVAL = 600000;
var ALERT_INTERVAL    = 120000;
var TOO_LONG = FORECAST_INTERVAL * 3;
var TABLE_TIME_INCREMENT = 3600000;
var OLDEST_ALLOWED_DATA = 10 * 3600000;

var debug = false;

var firstTime = true;

var pattern = /[^:]+:\d\d/;

// check for changes 
setInterval(function(){
    let delta = timePortal() - lastUpdateTime;
    let alertDelta = timePortal() - lastAlertUpdateTime;
    if (delta > FORECAST_INTERVAL || emulatorTime != null) {
        updateJSONObject();
    }
    if (alertDelta > ALERT_INTERVAL || emulatorTime != null) {
        updateAlertInformation();
    }
    if ((lastAlertUpdateTime != null) && alertDelta > TOO_LONG) {
        console.log("alert query has timed out and is being cleared");
        updateAlertInProgress = false;
        resets++;
        lastAlertUpdateTime = timePortal();
    }
    if ((lastUpdateTime != null) && delta > TOO_LONG) {
        console.log("forecast/radar query has timed out and is being cleared");
        updateInProgress = false;
        resets++;
        lastUpdateTime = timePortal();
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
    response.send(mainPageDOM.serialize());
});
app.get("/testData", function(request, response, next) {
    let testObject = { forecastInfo: observedJSONObjectForecasts,
                       alertInfo: headlines,
                       display: displayObject,
                       fileName: fileName };
    console.log("processing /testData");
    console.log(request.url);
    console.log(request.method);
    // this is a request to retrieve the test data for the server
    response.send(JSON.stringify(testObject));
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
