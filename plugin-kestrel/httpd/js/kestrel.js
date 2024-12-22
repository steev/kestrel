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

let mapMarkers = new Map();
let mapInstance;
let mapTileLayer;
let isActiveTab = false;
let refreshTimer;

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
          '<link rel="stylesheet" href="/plugin/kestrel/css/MarkerCluster.css">'
        );
        $(div).append(
          '<link rel="stylesheet" href="/plugin/kestrel/css/MarkerCluster.Default.css">'
        );
        $(div).append(
          '<link rel="stylesheet" href="/plugin/kestrel/css/Leaflet.DonutCluster.css">'
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
        // Uncomment additional formats to use with leaflet.mouseCoordinate
        // Ref: https://github.com/wattnpapa/leaflet.mouseCoordinate
        // $(div).append('<script src="/plugin/kestrel/js/nac.js"></script>');
        // $(div).append('<script src="/plugin/kestrel/js/qth.js"></script>');
        // $(div).append('<script src="/plugin/kestrel/js/utm.js"></script>');
        // $(div).append('<script src="/plugin/kestrel/js/utmref.js"></script>');
        $(div).append('<script src="/plugin/kestrel/js/leaflet.js"></script>');
        $(div).append(
          '<script src="/plugin/kestrel/js/leaflet.markercluster.js"></script>'
        );
        $(div).append(
          '<script src="/plugin/kestrel/js/Leaflet.DonutCluster.js"></script>'
        );
        $(div).append(
          '<script src="/plugin/kestrel/js/leaflet.mousecoordinate.min.js">'
        );
        $(div).append(
          '<script src="/plugin/kestrel/js/L.Control.ResetView.min.js"></script>'
        );

        function getDeviceMarkerIcon(deviceType) {
          let iconUrl = "/plugin/kestrel/images/ic_bluetooth_black_24dp_1x.png";

          switch (deviceType) {
            case "Wi-Fi AP":
              iconUrl = "/plugin/kestrel/images/ic_router_black_24dp_1x.png";
              break;
            case "Wi-Fi Client":
              iconUrl =
                "/plugin/kestrel/images/ic_laptop_chromebook_black_24dp_1x.png";
              break;
            case "Wi-Fi Bridged":
              iconUrl =
                "/plugin/kestrel/images/ic_power_input_black_24dp_1x.png";
              break;
            case "Wi-Fi WDS":
              iconUrl = "/plugin/kestrel/images/ic_leak_add_black_24dp_1x.png";
              break;
            case "Wi-Fi Ad-Hoc":
              iconUrl =
                "/plugin/kestrel/images/ic_cast_connected_black_24dp_1x.png";
              break;
            case "Wi-Fi Device":
              iconUrl =
                "/plugin/kestrel/images/ic_network_check_black_24dp_1x.png";
              break;
            case "":
              iconUrl =
                "/plugin/kestrel/images/ic_network_check_black_24dp_1x.png";
              break;
            default:
              break;
          }

          return L.icon({
            iconUrl: iconUrl,
            iconSize: [24, 24],
          });
        }

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

        // Create the markercluster
        let donutLayer = L.DonutCluster(
          // The first parameter is the standard marker cluster's configuration.
          {
            chunkedLoading: true,
          },
          // The second parameter is the donut cluster's configuration.
          {
            // Mandatory, indicates the field to group items by in order to create donut' sections.
            key: "type",
            // Mandatory, the arc color for each donut section.
            // If array of colors will loop over it to pick color of each section sequentially.
            arcColorDict: [
              "red",
              "blue",
              "yellow",
              "black",
              "orange",
              "purple",
              "fuschia",
            ],
            // Set this to true to avoid displaying legend on mouse over
            hideLegend: false,
          }
        );
        mapInstance.addLayer(donutLayer);

        // Prevent spiderfied markers to close on updates by stopping refresh temporarily
        // @todo on mouse hover of marker, show tooltip of basic information (mac/type/ssid)
        donutLayer.on("spiderfied", stopRefresh);
        donutLayer.on("unspiderfied", startRefresh);

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

          let location;
          for (const d of devices) {
            // @todo use last known good coords?
            // @todo from this device or any device? customize through settings?
            if (d["location"] === 0) {
              location = L.latLng(0.0, 0.0);
            } else {
              location = L.latLng(d["location"][1], d["location"][0]);
            }

            if (mapMarkers.has(d["kismet.device.base.key"])) {
              mapMarkers.get(d["kismet.device.base.key"]).setLatLng(location);
            } else {
              let marker = L.marker(location, {
                base_key: d["kismet.device.base.key"],
                type: d["kismet.device.base.type"], // the value to group
                icon: getDeviceMarkerIcon(d["kismet.device.base.type"]),
              });
              marker.on("click", function () {
                kismet_ui.DeviceDetailWindow(d["kismet.device.base.key"]);
              });
              mapMarkers.set(d["kismet.device.base.key"], marker);
              donutLayer.addLayer(marker);
            }

            // Update last device heard timestamp for next call
            if (d["kismet.device.base.last_time"] > last_heard) {
              last_heard = d["kismet.device.base.last_time"];
            }
          }
        }

        // Run when the map gets initialized and at least one layer,
        // or immediately if it's already initialized.
        mapInstance.whenReady(function () {
          startRefresh();

          // @todo replace with a fitBounds of loaded data? (event based? add a toggle button to leaflet?)
          mapInstance.flyTo(kestrelInitialLatLon);

          // @todo Add a button to set a new reset location/zoom
          L.control
            .resetView({
              position: "topleft",
              title: "Reset view",
              latlng: mapInstance.getCenter(),
              zoom: mapInstance.getZoom(),
            })
            .addTo(mapInstance);
        });

        function startRefresh() {
          refreshDevices();
          refreshTimer = setInterval(refreshDevices, kestrelRefreshInterval);
        }

        function stopRefresh() {
          clearTimeout(refreshTimer);
        }

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
