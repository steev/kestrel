// Author: soliforte
// Email: soliforte@protonmail.com
// Git: github.com/soliforte
// Freeware, enjoy. If you do something really cool with it, let me know. Pull requests encouraged

var mapInstance;
var mapTileLayer;

kismet_ui_tabpane.AddTab(
  {
    id: "kestrel",
    tabTitle: "Kestrel",
    priority: -1,
    createCallback: function (div) {
      $(document).ready(function () {
        $(div).append(
          '<link rel="stylesheet" href="/plugin/kestrel/css/leaflet.css">'
        );
        $(div).append(
          '<link rel="stylesheet" href="/plugin/kestrel/css/leafletKestrel.css">'
        );
        $(div).append(
          '<link rel="stylesheet" href="/plugin/kestrel/css/leaflet.mousecoordinate.css">'
        );
        $(div).append(
          '<link rel="stylesheet" href="/plugin/kestrel/css/L.Control.ResetView.min.css">'
        );
        $(div).append(
          '<script src="/plugin/kestrel/js/underscore-min.js"></script>'
        );
        $(div).append(
          '<script src="/plugin/kestrel/js/PruneCluster.js"></script>'
        );
        // Uncomment additional formats to use with leaflet.mouseCoordinate
        // Ref: https://github.com/wattnpapa/leaflet.mouseCoordinate
        // $(div).append('<script src="/plugin/kestrel/js/nac.js"></script>');
        // $(div).append('<script src="/plugin/kestrel/js/qth.js"></script>');
        // $(div).append('<script src="/plugin/kestrel/js/utm.js"></script>');
        // $(div).append('<script src="/plugin/kestrel/js/utmref.js"></script>');
        $(div).append('<script src="/plugin/kestrel/js/leaflet.js"></script>');
        $(div).append(
          '<script src="/plugin/kestrel/js/leaflet.mousecoordinate.min.js">'
        );
        $(div).append(
          '<script src="/plugin/kestrel/js/L.Control.ResetView.min.js"></script>'
        );

        //Instantiate cluster for le clustering of devices
        var dataCluster = new PruneClusterForLeaflet();
        //Build custom ClusterIcon
        dataCluster.BuildLeafletClusterIcon = function (cluster) {
          var e = new L.Icon.MarkerCluster();
          e.stats = cluster.stats;
          e.population = cluster.population;
          return e;
        };

        //Instantiate map
        mapInstance = L.map("kestrel").setView([0.0, 0.0], 1);
        mapTileLayer = L.tileLayer(
          "http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            maxZoom: 19,
            attribution:
              '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          }
        ).addTo(mapInstance);

        // Additional options on leaflet.mouseCoordinate's GitHub
        // Ref: https://github.com/wattnpapa/leaflet.mouseCoordinate
        L.control
          .mouseCoordinate({ gps: true, gpsLong: false })
          .addTo(mapInstance);

        // Reset view button
        L.control.resetView({
          position: "topleft",
          title: "Reset view",
          latlng: L.latLng([0.0, -0.0]),
          zoom: 1,
        }).addTo(mapInstance);

        var colors = [
          "#ff4b00",
          "#bac900",
          "#EC1813",
          "#55BCBE",
          "#D2204C",
          "#FF0000",
          "#ada59a",
          "#3e647e",
        ];
        var pi2 = Math.PI * 2;

        L.Icon.MarkerCluster = L.Icon.extend({
          options: {
            iconSize: new L.Point(44, 44),
            className: "prunecluster leaflet-markercluster-icon",
          },
          createIcon: function () {
            // based on L.Icon.Canvas from shramov/leaflet-plugins (BSD licence)
            var e = document.createElement("canvas");
            this._setIconStyles(e, "icon");
            var s = this.options.iconSize;
            e.width = s.x;
            e.height = s.y;
            this.draw(e.getContext("2d"), s.x, s.y);
            return e;
          },
          createShadow: function () {
            return null;
          },
          draw: function (canvas, width, height) {
            var start = 0;
            for (var i = 0, l = colors.length; i < l; ++i) {
              var size = this.stats[i] / this.population;
              if (size > 0) {
                canvas.beginPath();
                canvas.moveTo(22, 22);
                canvas.fillStyle = colors[i];
                var from = start + 0.14,
                  to = start + size * pi2;
                if (to < from) {
                  from = start;
                }
                canvas.arc(22, 22, 22, from, to);
                start = start + size * pi2;
                canvas.lineTo(22, 22);
                canvas.fill();
                canvas.closePath();
              }
            }
            canvas.beginPath();
            canvas.fillStyle = "white";
            canvas.arc(22, 22, 18, 0, Math.PI * 2);
            canvas.fill();
            canvas.closePath();
            canvas.fillStyle = "#555";
            canvas.textAlign = "center";
            canvas.textBaseline = "middle";
            canvas.font = "bold 12px sans-serif";
            canvas.fillText(this.population, 22, 22, 40);
          },
        });
        var macs = [];

        // Create empty polyline, locations will be added/plotted as GPS updates
        // var drivePath = L.polyline([], {
        //   color: "blue",
        //   smoothFactor: 1,
        // });
        // drivePath.addTo(mapInstance);

        // Prevent duplicate locations in the drivePath polyline (reduce risk of high cpu/mem usage)
        // var previousLocation = [0, 0];
        // var mapFitBound = false;

        // Create vehicle marker, stage at 0,0 until GPS updates
        // var driveMarker = L.marker([0, 0]);
        // driveMarker.addTo(mapInstance);

        // Event called when Leaflet thinks all visible tiles are loaded
        // Invalidating the size ensures half-visible tiles (grayed areas) are loaded
        mapTileLayer.on("load", function () {
          mapInstance.invalidateSize();
        });

        $("#centerpane-tabs").on("resize", function () {
          mapInstance.invalidateSize();
        });

        // Retrieve all devices once
        getOldDevs();

        // Schedule periodic updates
        setInterval(addDevs, 1000);

        // Update drive path (once)
        // updateDrivePath();

        // function updateDrivePath() {
        //   $.get("/gps/location.json").done(function (data) {
        //     console.log(data);
        //     var currentLocation = [
        //       data["kismet.common.location.geopoint"][1],
        //       data["kismet.common.location.geopoint"][0],
        //     ];
        //     // console.log("currentLocation: " + currentLocation);
        //     // console.log("previousLocation: " + previousLocation);
        //     if (
        //       !currentLocation ||
        //       (!currentLocation[0] && !currentLocation[1]) ||
        //       (currentLocation[0] == previousLocation[0] &&
        //         currentLocation[1] == previousLocation[1])
        //     ) {
        //       // console.log("Skipped invalid or previous location");
        //       return true;
        //     } else {
        //       // console.log("New location: " + currentLocation)
        //       drivePath.addLatLng(currentLocation);
        //       driveMarker.setLatLng(currentLocation);
        //       previousLocation = currentLocation;
        //       if (!mapFitBound) {
        //         // console.log("Fitting drive path within map bounds.")
        //         mapInstance.setView(driveMarker.getLatLng());
        //         mapInstance.fitBounds(drivePath.getBounds());
        //         mapFitBound = true;
        //       }
        //     }
        //   });
        // }

        function getOldDevs() {
          $.ajax({
            url: "/devices/last-time/1/devices.json",
            dataType: "json",
            timeout: 30000,
            success: function (devs) {
              if (!Array.isArray(devs)) {
                return;
              }

              var ssid = "";
              var type = "";
              var mac = "";
              var rssi = "";
              var manuf = "";
              var lat = "";
              var lon = "";
              var min_lat = 0.0;
              var min_lon = 0.0;
              var max_lat = 0.0;
              var max_lon = 0.0;
              for (var x = 0; x < devs.length; x++) {
                ssid = devs[x]["kismet.device.base.name"];
                type = devs[x]["kismet.device.base.type"];
                mac = devs[x]["kismet.device.base.macaddr"];
                if ("kismet.device.base.signal" in devs[x]) {
                  rssi =
                    devs[x]["kismet.device.base.signal"][
                      "kismet.common.signal.last_signal"
                    ]; //Last signal dBm
                } else {
                  rssi = 0;
                }
                manuf = devs[x]["kismet.device.base.manuf"];
                if ("kismet.device.base.location" in devs[x]) {
                  lat =
                    devs[x]["kismet.device.base.location"][
                      "kismet.common.location.avg_loc"
                    ]["kismet.common.location.geopoint"][1];
                  lon =
                    devs[x]["kismet.device.base.location"][
                      "kismet.common.location.avg_loc"
                    ]["kismet.common.location.geopoint"][0];
                  if (lat < min_lat) min_lat = lat;
                  if (lon < min_lon) min_lon = lon;
                  if (lat > max_lat) max_lat = lat;
                  if (lon > max_lon) max_lon = lon;
                } else {
                  lat = 0.0;
                  lon = 0.0;
                }
                var device = {
                  SSID: ssid,
                  TYPE: type,
                  MAC: mac,
                  RSSI: rssi,
                  LAT: lat,
                  LON: lon,
                  MANUF: manuf,
                };
                macs.push(device);
              } // end of for

              mapInstance.fitBounds([
                [min_lat, min_lon],
                [max_lat, max_lon],
              ]);
            }, //end of success
          }); // end of ajax
        } //end of getdevs

        function addDevs() {
          getDevs();
          var uniqmacs = _.uniq(macs, "MAC");
          dataCluster.RemoveMarkers();
          // var search = document.getElementById("device_search").value;
          var search = "";
          for (var i in uniqmacs) {
            var marker = new PruneCluster.Marker(
              uniqmacs[i]["LAT"],
              uniqmacs[i]["LON"]
            );
            marker.data.id = uniqmacs[i]["MAC"];
            marker.filtered = false;
            if (uniqmacs[i]["TYPE"] == "Wi-Fi AP") {
              marker.data.icon = L.icon({
                iconUrl: "/plugin/kestrel/images/ic_router_black_24dp_1x.png",
                iconSize: [24, 24],
              });
              marker.category = 1;
              marker.weight = 1;
            } else if (uniqmacs[i]["TYPE"] == "Wi-Fi Client") {
              marker.data.icon = L.icon({
                iconUrl:
                  "/plugin/kestrel/images/ic_laptop_chromebook_black_24dp_1x.png",
                iconSize: [24, 24],
              });
              marker.category = 2;
              marker.weight = 1;
            } else if (uniqmacs[i]["TYPE"] == "Wi-Fi Bridged") {
              marker.data.icon = L.icon({
                iconUrl:
                  "/plugin/kestrel/images/ic_power_input_black_24dp_1x.png",
                iconSize: [24, 24],
              });
              marker.category = 3;
              marker.weight = 1;
            } else if (uniqmacs[i]["TYPE"] == "Wi-Fi WDS") {
              marker.data.icon = L.icon({
                iconUrl: "/plugin/kestrel/images/ic_leak_add_black_24dp_1x.png",
                iconSize: [24, 24],
              });
              marker.category = 3;
              marker.weight = 1;
            } else if (uniqmacs[i]["TYPE"] == "Wi-Fi Ad-Hoc") {
              marker.data.icon = L.icon({
                iconUrl:
                  "/plugin/kestrel/images/ic_cast_connected_black_24dp_1x.png",
                iconSize: [24, 24],
              });
              marker.category = 3;
              marker.weight = 1;
            } else if (uniqmacs[i]["TYPE"] == "Wi-Fi Device") {
              marker.data.icon = L.icon({
                iconUrl:
                  "/plugin/kestrel/images/ic_network_check_black_24dp_1x.png",
                iconSize: [24, 24],
              });
              marker.category = 3;
              marker.weight = 1;
            } else if (uniqmacs[i]["TYPE"] == "") {
              marker.data.icon = L.icon({
                iconUrl:
                  "/plugin/kestrel/images/ic_network_check_black_24dp_1x.png",
                iconSize: [24, 24],
              });
              marker.category = 3;
              marker.weight = 1;
            } else if (uniqmacs[i]["TYPE"] == "Wi-Fi Client") {
              marker.data.icon = L.icon({
                iconUrl:
                  "/plugin/kestrel/images/ic_laptop_chromebook_black_24dp_1x.png",
                iconSize: [24, 24],
              });
              marker.category = 3;
              marker.weight = 1;
            } else {
              marker.data.icon = L.icon({
                iconUrl:
                  "/plugin/kestrel/images/ic_bluetooth_black_24dp_1x.png",
                iconSize: [24, 24],
              });
              marker.category = 5;
              marker.weight = 1;
            }
            marker.data.popup =
              "SSID: " +
              uniqmacs[i]["SSID"] +
              "<br>MAC: " +
              uniqmacs[i]["MAC"] +
              "<br>Manufacturer: " +
              uniqmacs[i]["MANUF"] +
              "<br>Type: " +
              uniqmacs[i]["TYPE"];
            if (uniqmacs[i]["SSID"].includes(search)) {
              dataCluster.RegisterMarker(marker);
            } else if (uniqmacs[i]["MAC"].includes(search)) {
              dataCluster.RegisterMarker(marker);
            } else if (uniqmacs[i]["TYPE"].includes(search)) {
              dataCluster.RegisterMarker(marker);
            }
          }
          dataCluster.ProcessView();
          var latlon = _.last(uniqmacs);
          mapInstance.addLayer(dataCluster); // Temporarily disabled locking-to-location until I figure a way to make it toggle-able. you can re-enable by adding .setView([latlon['LAT'],latlon['LON']], 16) to the end of this line
          macs = uniqmacs;
          //$.cookie("storedmacs", JSON.stringify(macs));
        }

        //Main routine, this gets devices and plots them
        function getDevs() {
          let ts = Math.floor(Date.now() / 1000) - 20000;

          $.ajax({
            url: "/devices/last-time/" + ts + "/devices.json",
            dataType: "json",
            timeout: 30000,
            success: function (devs) {
              var ssid = "";
              var type = "";
              var mac = "";
              var manuf = "";
              var rssi = "";
              var lat = "";
              var lon = "";
              for (var x = 0; x < devs.length; x++) {
                ssid = devs[x]["kismet.device.base.name"];
                type = devs[x]["kismet.device.base.type"];
                mac = devs[x]["kismet.device.base.macaddr"];
                manuf = devs[x]["kismet.device.base.manuf"];
                if ("kismet.device.base.signal" in devs[x]) {
                  rssi =
                    devs[x]["kismet.device.base.signal"][
                      "kismet.common.signal.last_signal"
                    ]; //Last signal dBm
                } else {
                  rssi = 0;
                }
                if ("kismet.device.base.location" in devs[x]) {
                  lat =
                    devs[x]["kismet.device.base.location"][
                      "kismet.common.location.avg_loc"
                    ]["kismet.common.location.geopoint"][1];
                  lon =
                    devs[x]["kismet.device.base.location"][
                      "kismet.common.location.avg_loc"
                    ]["kismet.common.location.geopoint"][0];
                } else {
                  lat = 0.0;
                  lon = 0.0;
                }
                var device = {
                  SSID: ssid,
                  TYPE: type,
                  MAC: mac,
                  RSSI: rssi,
                  LAT: lat,
                  LON: lon,
                  MANUF: manuf,
                };
                macs.push(device);
              } // end of for
            },
            fail: function (res) {
              console.log("getDevs failed! ", res);
            },
          }); // end of ajax
        } //end of getdevs
      }); //end of document.ready
    }, //end of createCallback
    activateCallback: function () {
      $(document).ready(function () {
        mapInstance.invalidateSize();
      });
    },
  },
  "center"
); //End of createCallback
