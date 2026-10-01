// Industrial Container Terminal Yard Layout Data & Base Station Setup
// Designed for Reach Stacker Autonomous Yard Navigation

export const YARD_CONFIG = {
  id: "YARD-01",
  name: "SOUTH DOCK AUTOMATION TERMINAL",
  code: "S-BASIN-Y01",
  center: [24.8540, 67.0230],
  defaultZoom: 17,
  minZoom: 15,
  maxZoom: 20,
  datum: "WGS 84 / UTM Zone 42N",
  gridSpacingMeters: 50
};

export const BASE_STATION = {
  id: "RTK-BASE-YARD01",
  name: "CENTRAL GNSS BASE TOWER",
  position: [24.85472, 67.02245], // [lat, lng]
  elevationMeters: 22.45,
  antennaType: "Choke Ring Multi-Constellation L1/L2/L5",
  utmCoords: { easting: 300184.22, northing: 2750341.68, zone: "42N" },
  status: "ONLINE",
  connection: "ETHERNET_POE_PRIMARY",
  firmware: "v4.18.2-RTK-IND",
  ntripCaster: {
    host: "192.168.10.50",
    port: 2101,
    mountpoint: "/RTK_BASE_Y01",
    format: "RTCM 3.2 MSM4",
    rate: "10 Hz"
  },
  coverageRadiusMeters: 850 // Local terminal high-accuracy coverage zone
};

// Container Yard Blocks (Bays with coordinates)
export const YARD_BLOCKS = [
  {
    id: "BLK-A",
    name: "BLOCK A: INBOUND DRY CARGO",
    type: "CONTAINER_STACK",
    bounds: [
      [24.8554, 67.0208],
      [24.8554, 67.0248],
      [24.8549, 67.0248],
      [24.8549, 67.0208]
    ],
    bays: ["A-01", "A-02", "A-03", "A-04", "A-05", "A-06", "A-07", "A-08"],
    maxTiers: 5,
    currentTEU: 420,
    status: "ACTIVE"
  },
  {
    id: "BLK-B",
    name: "BLOCK B: OUTBOUND EXPORT",
    type: "CONTAINER_STACK",
    bounds: [
      [24.8543, 67.0208],
      [24.8543, 67.0248],
      [24.8538, 67.0248],
      [24.8538, 67.0208]
    ],
    bays: ["B-01", "B-02", "B-03", "B-04", "B-05", "B-06", "B-07", "B-08"],
    maxTiers: 4,
    currentTEU: 380,
    status: "ACTIVE"
  },
  {
    id: "BLK-REEFER",
    name: "BLOCK R: REEFER POWER RACKS",
    type: "REEFER",
    bounds: [
      [24.8533, 67.0208],
      [24.8533, 67.0232],
      [24.8528, 67.0232],
      [24.8528, 67.0208]
    ],
    bays: ["R-01", "R-02", "R-03", "R-04"],
    status: "TEMP_MONITORED"
  },
  {
    id: "BLK-HAZMAT",
    name: "ZONE H: DANGEROUS GOODS (HAZMAT)",
    type: "HAZMAT",
    bounds: [
      [24.8533, 67.0238],
      [24.8533, 67.0255],
      [24.8525, 67.0255],
      [24.8525, 67.0238]
    ],
    bays: ["HZ-01", "HZ-02"],
    status: "RESTRICTED_ACCESS"
  },
  {
    id: "DEPOT-STACKER",
    name: "REACH STACKER FLEET DEPOT & CHARGING",
    type: "MAINTENANCE",
    bounds: [
      [24.8558, 67.0242],
      [24.8558, 67.0258],
      [24.8551, 67.0258],
      [24.8551, 67.0242]
    ],
    bays: ["STALL-01", "STALL-02", "STALL-03"],
    status: "ROVER_DOCK"
  },
  {
    id: "GATE-SCALES",
    name: "MAIN OCR GATE & WEIGHBRIDGE",
    type: "GATE",
    bounds: [
      [24.8525, 67.0205],
      [24.8525, 67.0222],
      [24.8520, 67.0222],
      [24.8520, 67.0205]
    ],
    status: "AUTOMATED_SCAN"
  }
];

// Driving Corridors / Reach Stacker Guideways
export const YARD_ROADS = [
  {
    id: "RD-NORTH-MAIN",
    name: "North Transit Runway (Lane 01)",
    speedLimitKmh: 25,
    path: [
      [24.8556, 67.0203],
      [24.8556, 67.0258]
    ]
  },
  {
    id: "RD-MID-AISLE",
    name: "Central Reach Stacker Work Aisle",
    speedLimitKmh: 15,
    path: [
      [24.8546, 67.0203],
      [24.8546, 67.0258]
    ]
  },
  {
    id: "RD-SOUTH-MAIN",
    name: "South Transfer Guideway",
    speedLimitKmh: 25,
    path: [
      [24.8535, 67.0203],
      [24.8535, 67.0258]
    ]
  },
  {
    id: "RD-WEST-SPUR",
    name: "West Perimeter Rail Corridor",
    speedLimitKmh: 20,
    path: [
      [24.8556, 67.0205],
      [24.8520, 67.0205]
    ]
  },
  {
    id: "RD-EAST-SPUR",
    name: "East Quayside Haul Road",
    speedLimitKmh: 20,
    path: [
      [24.8558, 67.0255],
      [24.8522, 67.0255]
    ]
  }
];

// Geofenced safety zones
export const GEOFENCES = [
  {
    id: "GEO-PERIMETER",
    name: "Terminal Operational Boundary",
    type: "BOUNDARY",
    color: "#00f0ff",
    polygon: [
      [24.8560, 67.0200],
      [24.8560, 67.0262],
      [24.8518, 67.0262],
      [24.8518, 67.0200]
    ]
  },
  {
    id: "GEO-HAZMAT",
    name: "Exclusion Zone // Dangerous Goods",
    type: "RESTRICTED",
    color: "#ff3366",
    polygon: [
      [24.8534, 67.0236],
      [24.8534, 67.0256],
      [24.8524, 67.0256],
      [24.8524, 67.0236]
    ]
  },
  {
    id: "GEO-STACKER-AISLE",
    name: "Reach Stacker Automated Loading Corridor",
    type: "CORRIDOR",
    color: "#ffb703",
    polygon: [
      [24.8548, 67.0206],
      [24.8548, 67.0250],
      [24.8544, 67.0250],
      [24.8544, 67.0206]
    ]
  }
];

// Placeholder for Future Rover Integration (Reach Stacker RS-01)
export const FUTURE_ROVER_SPEC = {
  id: "ROVER-RS-01",
  name: "Reach Stacker Unit 01",
  assetType: "Autonomous Reach Stacker (45T Spreader)",
  status: "NOT_CONNECTED",
  statusReason: "Awaiting Hardware Bridge / LoRa Telemetry Link",
  placeholderPosition: [24.8553, 67.0245], // Docked stall in depot
  batteryPercent: null,
  headingDegrees: 180,
  speedKmh: 0,
  gpsStatus: "NO_LINK",
  telemetryFields: [
    "Location (RTK Rover Fixed/Float)",
    "Boom Extension Angle & Length",
    "Twistlock Locked / Unlocked Status",
    "Container Gross Weight (Metric Ton)",
    "Container ISO Code (OCR Scanned)",
    "CANbus J1939 Engine Diagnostics",
    "LiDAR Anti-Collision Sensor Health",
    "Battery / Fuel Level"
  ]
};
