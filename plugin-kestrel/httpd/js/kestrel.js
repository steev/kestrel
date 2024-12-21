// Author: soliforte
// Email: soliforte@protonmail.com
// Git: github.com/soliforte
// Freeware, enjoy. If you do something really cool with it, let me know. Pull requests encouraged

// Refresh interval in milliseconds
// Default: 1000 (1sec)
const REFRESH_INTERVAL = 1000;

// Initial location (format: DD.DDDDDD, DD.DDDDDD)
// Default: [0.0, 0.0]
const INITIAL_LATLON = [0.0, 0.0];

// Colors used for the cluster donuts
const COLORS = [
  "#ff4b00",
  "#bac900",
  "#EC1813",
  "#55BCBE",
  "#D2204C",
  "#FF0000",
  "#ada59a",
  "#3e647e",
];

// Simple way to do the math once
const PI2 = Math.PI * 2;

const KISMET_FIELDS = {
  fields: [
    "kismet.device.base.key",
    "kismet.device.base.type",
    "kismet.device.base.name",
    "kismet.device.base.macaddr",
    "kismet.device.base.manuf",
    "kismet.device.base.last_time",
    [
      "kismet.device.base.signal/kismet.common.signal.last_signal",
      "last_signal",
    ],
    // @todo Add a setting to switch between average/first/last location (same for signal?)
    // [
    //   "kismet.device.base.location/kismet.common.location.avg_loc/kismet.common.location.geopoint",
    //   "location",
    // ],
    [
      "kismet.device.base.location/kismet.common.location.last/kismet.common.location.geopoint",
      "location",
    ],
  ],
};
const KISMET_FIELDS_QUERY = "json=" + JSON.stringify(KISMET_FIELDS);

let kestrelRefreshInterval = kismet.getStorage(
  "kismet.kestrel.refresh_interval",
  REFRESH_INTERVAL
);
let kestrelInitialLatLon = kismet.getStorage(
  "kismet.kestrel.initial_latlon",
  INITIAL_LATLON
);

let kestrel_initial_timeframe = 1;

let markers = new Map();
let mapInstance;
let mapTileLayer;
let isActiveTab = false;

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
          '<link rel="stylesheet" href="/plugin/kestrel/css/kestrel.css">'
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

        function createDeviceMarker(d) {
          let marker = new PruneCluster.Marker(
            d["location"][1],
            d["location"][0]
          );

          switch (d["kismet.device.base.type"]) {
            case "Wi-Fi AP":
              marker.data.icon = L.icon({
                iconUrl: "/plugin/kestrel/images/ic_router_black_24dp_1x.png",
                iconSize: [24, 24],
              });
              marker.category = 1;
              marker.weight = 1;
              break;
            case "Wi-Fi Client":
              marker.data.icon = L.icon({
                iconUrl:
                  "/plugin/kestrel/images/ic_laptop_chromebook_black_24dp_1x.png",
                iconSize: [24, 24],
              });
              marker.category = 2;
              marker.weight = 1;
              break;
            case "Wi-Fi Bridged":
              marker.data.icon = L.icon({
                iconUrl:
                  "/plugin/kestrel/images/ic_power_input_black_24dp_1x.png",
                iconSize: [24, 24],
              });
              marker.category = 3;
              marker.weight = 1;
              break;
            case "Wi-Fi WDS":
              marker.data.icon = L.icon({
                iconUrl: "/plugin/kestrel/images/ic_leak_add_black_24dp_1x.png",
                iconSize: [24, 24],
              });
              marker.category = 3;
              marker.weight = 1;
              break;
            case "Wi-Fi Ad-Hoc":
              marker.data.icon = L.icon({
                iconUrl:
                  "/plugin/kestrel/images/ic_cast_connected_black_24dp_1x.png",
                iconSize: [24, 24],
              });
              marker.category = 3;
              marker.weight = 1;
              break;
            case "Wi-Fi Device":
              marker.data.icon = L.icon({
                iconUrl:
                  "/plugin/kestrel/images/ic_network_check_black_24dp_1x.png",
                iconSize: [24, 24],
              });
              marker.category = 3;
              marker.weight = 1;
              break;
            case "":
              marker.data.icon = L.icon({
                iconUrl:
                  "/plugin/kestrel/images/ic_network_check_black_24dp_1x.png",
                iconSize: [24, 24],
              });
              marker.category = 3;
              marker.weight = 1;
              break;
            default:
              marker.data.icon = L.icon({
                iconUrl:
                  "/plugin/kestrel/images/ic_bluetooth_black_24dp_1x.png",
                iconSize: [24, 24],
              });
              marker.category = 5;
              marker.weight = 1;
              break;
          }

          return marker;
        }

        // Add icon formatter for marker clusters (to donuts)
        L.Icon.MarkerCluster = L.Icon.extend({
          options: {
            iconSize: new L.Point(44, 44),
            className: "prunecluster leaflet-markercluster-icon",
          },
          createIcon: function () {
            // based on L.Icon.Canvas from shramov/leaflet-plugins (BSD licence)
            let e = document.createElement("canvas");
            this._setIconStyles(e, "icon");
            let s = this.options.iconSize;
            e.width = s.x;
            e.height = s.y;
            this.draw(e.getContext("2d"), s.x, s.y);
            return e;
          },
          createShadow: function () {
            return null;
          },
          draw: function (canvas, width, height) {
            let start = 0;
            for (let i = 0, l = COLORS.length; i < l; ++i) {
              let size = this.stats[i] / this.population;
              if (size > 0) {
                canvas.beginPath();
                canvas.moveTo(22, 22);
                canvas.fillStyle = COLORS[i];
                let from = start + 0.14,
                  to = start + size * PI2;
                if (to < from) {
                  from = start;
                }
                canvas.arc(22, 22, 22, from, to);
                start = start + size * PI2;
                canvas.lineTo(22, 22);
                canvas.fill();
                canvas.closePath();
              }
            }
            canvas.beginPath();
            canvas.fillStyle = "white";
            canvas.arc(22, 22, 18, 0, PI2);
            canvas.fill();
            canvas.closePath();
            canvas.fillStyle = "#555";
            canvas.textAlign = "center";
            canvas.textBaseline = "middle";
            canvas.font = "bold 12px sans-serif";
            canvas.fillText(this.population, 22, 22, 40);
          },
        });

        // Instantiate map
        mapInstance = L.map("kestrel").setView(kestrelInitialLatLon, 1);
        mapTileLayer = L.tileLayer(
          "http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            maxZoom: 19,
            attribution:
              '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          }
        ).addTo(mapInstance);

        // Event called when Leaflet thinks all visible tiles are loaded
        // Invalidating the size ensures half-visible tiles (grayed areas) are loaded
        mapTileLayer.on("load", function () {
          mapInstance.invalidateSize();
        });

        // Attempt to refresh tiles when Kismet's layout is resized
        $("#centerpane-tabs").on("resize", function () {
          mapInstance.invalidateSize();
        });

        // Additional options on leaflet.mouseCoordinate's GitHub
        // Ref: https://github.com/wattnpapa/leaflet.mouseCoordinate
        L.control
          .mouseCoordinate({ gps: true, gpsLong: false })
          .addTo(mapInstance);

        // Instantiate cluster for le clustering of devices
        let clusterLayer = new PruneClusterForLeaflet();
        mapInstance.addLayer(clusterLayer);

        // Override cluster icon builder
        clusterLayer.BuildLeafletClusterIcon = function (cluster) {
          let e = new L.Icon.MarkerCluster();
          e.stats = cluster.stats;
          e.population = cluster.population;
          return e;
        };

        // Fetch initial devices based on timeframe set
        let last_heard = kestrel_initial_timeframe;

        function refreshDevices() {
          // Skip if not active tab
          if (!isActiveTab) return;

          let url =
            local_uri_prefix +
            "/devices/views/all/last-time/" +
            last_heard +
            "/devices.json";

          $.ajax({
            type: "POST",
            url: url,
            data: KISMET_FIELDS_QUERY,
            success: plotDevices,
            dataType: "json",
          });
        }

        function plotDevices(response) {
          let devices = kismet.sanitizeObject(response);

          for (const d of devices) {
            if (markers.has(d["kismet.device.base.key"])) {
              markers
                .get(d["kismet.device.base.key"])
                .Move(d["location"][1], d["location"][0]);
            } else {
              let marker = createDeviceMarker(d);

              marker.data.popup = `<table>
              <tr><th>MAC</th><td>${d["kismet.device.base.macaddr"]}</td></tr>
              <tr><th>SSID</th><td>${d["kismet.device.base.name"]}</td></tr>
              <tr><th>Type</th><td>${d["kismet.device.base.type"]}</td></tr>
              <tr><th>Manuf</th><td>${d["kismet.device.base.manuf"]}</td></tr>
              <tr><th>RSSI</th><td>${d["last_signal"]}</td></tr>
              <tr><th>Coords</th><td>${d["location"][1]}, ${d["location"][0]}</td></tr>
              </table>
              <button type="button" class="kestrelDetailsBtn" value="${d["kismet.device.base.key"]}">Device Details</a>`;

              markers.set(d["kismet.device.base.key"], marker);
              clusterLayer.RegisterMarker(marker);
            }

            // Update last device heard timestamp for next call
            if (d["kismet.device.base.last_time"] > last_heard) {
              last_heard = d["kismet.device.base.last_time"];
            }
          }

          clusterLayer.ProcessView();

          $(".kestrelDetailsBtn").on("click", function () {
            kismet_ui.DeviceDetailWindow($(this).val());
          });
        }

        // Run when the map gets initialized and at least one layer,
        // or immediately if it's already initialized.
        mapInstance.whenReady(function () {
          refreshDevices();

          clusterLayer.FitBounds();

          // @todo Add a button to set a new reset location/zoom
          L.control
            .resetView({
              position: "topleft",
              title: "Reset view",
              latlng: mapInstance.getCenter(),
              zoom: mapInstance.getZoom(),
            })
            .addTo(mapInstance);

          setInterval(refreshDevices, kestrelRefreshInterval);
        });

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
      }); //end of document.ready
    },
    activateCallback: function () {
      isActiveTab = true;

      $(document).ready(function () {
        mapInstance.invalidateSize();
      });
    },
    deactivateCallback: function () {
      isActiveTab = false;
    },
  },
  "center" // Add tab to center pane of layout
);

kismet_ui_settings.AddSettingsPane({
  id: "kestrel_settings",
  listTitle: "Kestrel",
  create: function (elem) {
    elem.append(
      $("<form>", {
        id: "form",
      })
        .append(
          $("<fieldset>", {
            id: "kestrel_general",
          })
            .append($("<legend>", {}).html("General"))
            .append(
              $("<label>", {
                for: "kestrel_initial_latlon",
              }).html(
                "Initial location to zoom in on when map initially loads (format DD.DDDDDD, DD.DDDDDD): "
              )
            )
            .append(
              $("<input>", {
                type: "text",
                name: "kestrel_initial_latlon",
                id: "kestrel_initial_latlon",
              })
            )
            .append($("<br>", {}))
            .append(
              $("<label>", {
                for: "kestrel_refresh_interval",
              }).html(
                "Interval between map data updates (in miliseconds, 1s = 1000ms): "
              )
            )
            .append(
              $("<input>", {
                type: "text",
                name: "kestrel_refresh_interval",
                id: "kestrel_refresh_interval",
              })
            )
        )
        .append($("<br>", {}))
        .append(
          $("<p>").html(
            "Note: Refresh the Kismet Web UI for changes to take effect."
          )
        )
    );

    $("#form", elem).on("change", function () {
      kismet_ui_settings.SettingsModified();
    });

    $("#kestrel_initial_latlon").val(
      kismet.getStorage("kismet.kestrel.initial_latlon", INITIAL_LATLON)
    );

    $("#kestrel_refresh_interval").val(
      kismet.getStorage("kismet.kestrel.refresh_interval", REFRESH_INTERVAL)
    );

    $("#kismet_general", elem).controlgroup();
  },
  save: function (elem) {
    let initial_latlon = $("input[name='kestrel_initial_latlon']", elem).val();
    kismet.putStorage(
      "kismet.kestrel.initial_latlon",
      initial_latlon.split(",")
    );

    let refresh_interval = $(
      "input[name='kestrel_refresh_interval']",
      elem
    ).val();
    kismet.putStorage("kismet.kestrel.refresh_interval", refresh_interval);

    return true;
  },
});
