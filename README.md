# SFWI Weather

This repository contains an HTTP server that can be used to provide local weather information to clients on a local (home) network.  This server has been built using my SFWI (Stop "Fiddling" with It) philosophy.  That is, it is meant to simply provide essential information with a simple interface.  There are no ads and few user controls.  Weather information is collected from the US government weather API, api.weather.gov.

The instructions below are meant to produce a Raspberry PI "appliance", a dedicated raspberry PI that only does one thing.  In this case the appliance is a weather server.  Once the install is completed, on boot the server will be started as a service and browsers will be able to view the weather page by going to http://sfwiWeather:3000 on your home network.

That said, this software doesn't have to be run on a raspberry PI nor does it have to be run as a service.  The application is written in JavaScript to be run with Node.js.  As long as you have a relatively current Node.js environment, you should be able to install the "package" and run the weather.js script that implements the server.  That is, it doesn't have to be on a Linux platform.

Parts I used:
  - Raspberry PI 0 W (or above - I use a zero)
  - 16 G SD card - 8 G would be sufficient and still overkill, more won't hurt
  - 110 to USB power suppy and adapter/cables to attach to the PI
  - Zebra Zero Black Ice GPIO case made by C4LABS

Assembly - Software:
  1)  Install Buster Lite from www.raspberrypi.org/downloads/raspbian.
      I do headless installs of my PI 0's which, on the publication date
      means that I copy the raspbian image to the SD card plugged into my
      Mac, mount the card and touch the ssh file on the boot partition and
      and create a wpa_supplicant.conf file that references my home network.
  2)  Put the SD card into the target PI and boot off the installed image.
  3)  Login to the PI, and run sudo raspi-config to change the password.
  4)  Also, using raspi-config, change the node name to sfwiWeather.
  5)  sudo apt-get update (to update the package list)
  6)  sudo apt-get upgrade (to install the latest packages)
  7)  sudo apt-get install nodejs (to install node.js)
  8)  sudo apt-get install npm (to install npm - node.js package manager)
  9)  sudo apt-get install git 
  10)  git clone https://github.com/mbroihier/sfwiWeather.git
  11) cd sfwiWeather
  12) npm install (this will install dependencies)
  13) ./configure lat lon name (where lat and lon are the latitude and longitude, which can have 4 significant digits but no trailing zeros, of your location of interest, and name is the name of the location)
  14) The index.html file built by configure can be edited to add a favorite link to other weather information sites
  15) sudo cp -p sfwiWeather.service /lib/systemd/system/
  16) sudo systemctl enable sfwiWeather.service
  17) reboot with sudo shutdown -r now, the server should start when the PI comes back up
  18) To run by hand, disable/stop the service using sytemctl, and type node weather.js within the sfwiWeather directory.  Log information will be displayed to the console. This may be useful if you need to debug something.
  
