// Real-time Telemetry & GNSS Constellation State for RTK Base Station

export const INITIAL_BASE_TELEMETRY = {
  stationId: "RTK-BASE-YARD01",
  stationName: "South Basin Base Beacon #1",
  isOnline: true,
  statusMode: "BASE_CASTER_ACTIVE",
  gnssStatus: "RTK_FIXED",
  latitude: 24.8547204,
  longitude: 67.0224512,
  altitude: 22.45,
  horizontalAccuracy: 0.006, // 6 mm
  verticalAccuracy: 0.012, // 12 mm
  pDOP: 1.12,
  hDOP: 0.68,
  vDOP: 0.89,
  trackedSatellites: 32,
  usedSatellites: 26,
  constellations: {
    GPS: { tracked: 10, used: 8, freq: "L1/L2/L5" },
    GLONASS: { tracked: 8, used: 7, freq: "G1/G2" },
    GALILEO: { tracked: 8, used: 6, freq: "E1/E5a/E5b" },
    BEIDOU: { tracked: 6, used: 5, freq: "B1/B2a" }
  },
  rtcmOutput: {
    format: "RTCM 3.2 MSM4",
    rateHz: 10,
    activeMessages: ["1005 (Station Pos)", "1074 (GPS MSM4)", "1084 (GLONASS MSM4)", "1094 (GALILEO MSM4)", "1124 (BEIDOU MSM4)"],
    packetsSent: 184920,
    bytesPerSec: 3420,
    correctionLatencyMs: 8,
    activeRoverClients: 0 // Will show 1 when rover preview is enabled
  },
  hardware: {
    tempC: 37.6,
    voltageV: 24.18,
    cpuLoadPercent: 14,
    memoryUsagePercent: 32,
    internalStorageFreePercent: 84,
    uptimeSeconds: 1572480, // ~18 days
    poeCurrentMa: 340,
    antennaConnection: "OK (NORMAL_CURRENT_54mA)"
  },
  network: {
    primaryInterface: "1000BASE-T (LAN)",
    secondaryInterface: "Industrial 4G/LTE (Standby)",
    ipAddress: "192.168.10.50",
    gateway: "192.168.10.1",
    ntripPort: 2101,
    signalDbm: -61,
    packetLossPercent: 0.0,
    pingMs: 4
  }
};

// Satellites for Signal-to-Noise Ratio (SNR) visualizer
export const MOCK_SATELLITES_LIST = [
  { prn: "G04", system: "GPS", el: 72, az: 140, snr: 48, status: "USED" },
  { prn: "G09", system: "GPS", el: 56, az: 285, snr: 45, status: "USED" },
  { prn: "G11", system: "GPS", el: 44, az: 42, snr: 43, status: "USED" },
  { prn: "G18", system: "GPS", el: 68, az: 210, snr: 47, status: "USED" },
  { prn: "G22", system: "GPS", el: 31, az: 315, snr: 39, status: "USED" },
  { prn: "R02", system: "GLONASS", el: 64, az: 78, snr: 44, status: "USED" },
  { prn: "R07", system: "GLONASS", el: 49, az: 195, snr: 42, status: "USED" },
  { prn: "R15", system: "GLONASS", el: 38, az: 330, snr: 37, status: "USED" },
  { prn: "E03", system: "GALILEO", el: 81, az: 165, snr: 49, status: "USED" },
  { prn: "E08", system: "GALILEO", el: 52, az: 25, snr: 46, status: "USED" },
  { prn: "E19", system: "GALILEO", el: 41, az: 240, snr: 41, status: "USED" },
  { prn: "B02", system: "BEIDOU", el: 60, az: 110, snr: 44, status: "USED" },
  { prn: "B07", system: "BEIDOU", el: 35, az: 290, snr: 38, status: "USED" }
];
