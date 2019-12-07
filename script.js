window.onload = function () {
    var arrayOfObjects = [],
        options = {
            series: {
                points: {show: false},
                lines: {show: true}
            },
            xaxis: {
                show: true,
                mode: "time",
                timeformat: "%a %I%p",
                minTickSize: [3, "hour"],
                font: {
                    size: 20,
                    color: "#000000"
                },
                timezone: "browser"
            },
            yaxes: [{position: "left",
                     ticks: [ [30, "30\xB0"], [40, "40" + "\xB0"], [50, "50" + "\xB0"], [60, "60" + "\xB0"], [70, "70" + "\xB0"], [80, "80" + "\xB0"] ],
                     font: {
                         size: 20,
                         color: "#000000"
                     }
                    }],
            legend: {
                show: true
            },
            grid: {
                clickable: false,
                hoverable: false
            }
        };

    var series;
    for (series in collectedData) {
        arrayOfObjects.push({data: collectedData[series], label: series, yaxis: 1});
    }
    // plot measurements
    $.plot($("#placeholder"), arrayOfObjects, options);
};


var count = 0;
setInterval(function () {
    var index,
        element;
    for (index = 0; index < 10; index += 1) {
        element = document.getElementById("frame" + index);
        if (element != null) {
            if (index === count) {
                element.setAttribute('style', 'display: block');
            } else {
                element.setAttribute('style', 'display: none');
            }
        }
    }
    count += 1;
    if (count > 9) {
        count = 0;
    }
}, 1000);
