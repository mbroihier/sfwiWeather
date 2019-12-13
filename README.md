# SFWI Weather

This repository contains an HTTP server that can be used to provide local weather information to clients on a local (home) network.  This server has been built using my SFWI (Stop "Fiddling" with It) philosophy.  That is, it is meant to simply provide the essential information with a simple interface.  There are no adds and few controls.  The US government weather information from the api.weather.gov server is used.

Parts:
  - Raspberry PI 0 (or above - I use a zero)
  - 8 G SD card - larger won't hurt
  - 110 to USB power suppy and adapter/cables to attach to the PI
  - Zebra Zero Black Ice GPIO case made by C4LABS

Assembly - Software:
  1)  Install Buster Lite from www.raspberrypi.org/downloads/raspbian
      I do headless installs of my PI 0's which, on the publication date
      means that I copy the raspbian image to the SD card plugged into my
      Mac, mount the card and touch the ssh file on the boot partition and
      and create a wpa_supplicant.conf file.
  2)  Boot off the installed image.
  3)  Change the password.
  4)  Change the node name to sfwiWeather.
  5)  sudo apt-get update
  6)  sudo apt-get upgrade
  7)  sudo apt-get nodejs
  8)  sudo apt-get npm
  9)  git clone https://github.com/mbroihier/sfwiWeather.git
  10) cd sfwiWeather
  11) npm install
  12) ./configure lat lon name (where lat and lon are the latitude and longitude, which can have 4 significant digits but no trailing zeros, of your location of interest, and name is the name of the location)
  13) The index.html file can be edited to add a favorite link to other weather information sites
  14) sudo cp -p sfwiWeather.service /lib/systemd/system/
  15) sudo systemctl enable sfwiWeather.service
  16) reboot with sudo shutdown -r now, the server should start when the PI comes back up
  17) To run by hand, disable/stop the service using sytemctl, and type node weather.js within the sfwiWeather directory.  Log information will be displayed to the console. 
  

```
cd tennisball
make
```

 10)  sudo cp -p tennisball.service /lib/systemd/system/ 
 11)  sudo systemctl enable tennisball


Reboot:
```
sudo shutdown -r now

```
This will start the tennisball application.  When it starts, it will start measuring the distance to the closest object to the PING sensor.  When it detects something at a stable distnace, it will begin lighting an LED indicating that an object is at the "target" distance.  If objects are too far away, the LED will be off.  This will run until the PI is powered off.

There are two versions: a C++ version and a python3 version.  The service runs the C++ version.  They python code is nice for quickly checking out ideas.

[Wiring](tennisball.pdf)