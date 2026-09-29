export type Store = {
  id: string;
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  address?: string;
  url?: string;
};

export type Country = {
  id: string;
  name: string;
  countryCode: string;
  /** ISO 3166-1 numeric, matches world-atlas feature ids. */
  isoNumeric: string;
  /** Globe focus when the country is opened. */
  latitude: number;
  longitude: number;
  /** Globe scale when the country is opened; 1 = whole globe. */
  zoom: number;
  stores: Store[];
};

export type GlobeProps = {
  countries: Country[];
  activeCountryId: string | null;
  activeStoreId: string | null;
  hoveredId: string | null;
  inView: boolean;
  reducedMotion: boolean;
};

export const countries: Country[] = [
  {
    id: "gb",
    name: "United Kingdom",
    countryCode: "GB",
    isoNumeric: "826",
    latitude: 54.2,
    longitude: -2.6,
    zoom: 6.5,
    stores: [
      { id: "gb-mayfair", name: "Mount Street", city: "London", latitude: 51.5098, longitude: -0.1502, address: "14 Mount Street, Mayfair, London W1K", url: "/stores/gb-mayfair" },
      { id: "gb-covent", name: "Floral Street", city: "London", latitude: 51.5125, longitude: -0.124, address: "27 Floral Street, Covent Garden, London WC2E", url: "/stores/gb-covent" },
      { id: "gb-manchester", name: "King Street", city: "Manchester", latitude: 53.4812, longitude: -2.2446, address: "8 King Street, Manchester M2", url: "/stores/gb-manchester" },
      { id: "gb-edinburgh", name: "George Street", city: "Edinburgh", latitude: 55.9533, longitude: -3.1995, address: "41 George Street, Edinburgh EH2", url: "/stores/gb-edinburgh" },
    ],
  },
  {
    id: "us",
    name: "United States",
    countryCode: "US",
    isoNumeric: "840",
    latitude: 38.5,
    longitude: -97,
    zoom: 1.8,
    stores: [
      { id: "us-soho", name: "Greene Street", city: "New York", latitude: 40.7231, longitude: -74.0021, address: "88 Greene Street, SoHo, New York 10012", url: "/stores/us-soho" },
      { id: "us-la", name: "Melrose Place", city: "Los Angeles", latitude: 34.0816, longitude: -118.377, address: "8520 Melrose Place, West Hollywood 90069", url: "/stores/us-la" },
      { id: "us-chicago", name: "Rush Street", city: "Chicago", latitude: 41.9, longitude: -87.626, address: "940 N Rush Street, Chicago 60611", url: "/stores/us-chicago" },
      { id: "us-miami", name: "Design District", city: "Miami", latitude: 25.8129, longitude: -80.1928, address: "140 NE 39th Street, Miami 33137", url: "/stores/us-miami" },
    ],
  },
  {
    id: "ae",
    name: "United Arab Emirates",
    countryCode: "AE",
    isoNumeric: "784",
    latitude: 24.6,
    longitude: 54.6,
    zoom: 9,
    stores: [
      { id: "ae-difc", name: "Gate Village", city: "Dubai", latitude: 25.2138, longitude: 55.282, address: "Gate Village 4, DIFC, Dubai", url: "/stores/ae-difc" },
      { id: "ae-mall", name: "Fashion Avenue", city: "Dubai", latitude: 25.1985, longitude: 55.2796, address: "Fashion Avenue, The Dubai Mall, Dubai", url: "/stores/ae-mall" },
      { id: "ae-abudhabi", name: "Al Maryah Island", city: "Abu Dhabi", latitude: 24.501, longitude: 54.389, address: "The Galleria, Al Maryah Island, Abu Dhabi", url: "/stores/ae-abudhabi" },
    ],
  },
  {
    id: "in",
    name: "India",
    countryCode: "IN",
    isoNumeric: "356",
    latitude: 21.5,
    longitude: 79,
    zoom: 2.7,
    stores: [
      { id: "in-mumbai", name: "Kala Ghoda", city: "Mumbai", latitude: 18.9281, longitude: 72.8318, address: "23 Rampart Row, Kala Ghoda, Mumbai 400001", url: "/stores/in-mumbai" },
      { id: "in-delhi", name: "Chanakyapuri", city: "New Delhi", latitude: 28.5976, longitude: 77.1868, address: "The Chanakya, Yashwant Place, New Delhi 110021", url: "/stores/in-delhi" },
      { id: "in-bengaluru", name: "Vittal Mallya Road", city: "Bengaluru", latitude: 12.9716, longitude: 77.5963, address: "UB City, Vittal Mallya Road, Bengaluru 560001", url: "/stores/in-bengaluru" },
    ],
  },
  {
    id: "jp",
    name: "Japan",
    countryCode: "JP",
    isoNumeric: "392",
    latitude: 36.2,
    longitude: 138.2,
    zoom: 4.2,
    stores: [
      { id: "jp-aoyama", name: "Minami-Aoyama", city: "Tokyo", latitude: 35.6654, longitude: 139.713, address: "5-2-1 Minami-Aoyama, Minato, Tokyo", url: "/stores/jp-aoyama" },
      { id: "jp-ginza", name: "Ginza", city: "Tokyo", latitude: 35.6696, longitude: 139.764, address: "6-10-1 Ginza, Chuo, Tokyo", url: "/stores/jp-ginza" },
      { id: "jp-osaka", name: "Shinsaibashi", city: "Osaka", latitude: 34.6717, longitude: 135.5015, address: "2-4-9 Shinsaibashisuji, Chuo, Osaka", url: "/stores/jp-osaka" },
      { id: "jp-kyoto", name: "Sanjo-dori", city: "Kyoto", latitude: 35.0087, longitude: 135.7626, address: "Sanjo-dori, Nakagyo, Kyoto", url: "/stores/jp-kyoto" },
    ],
  },
  {
    id: "au",
    name: "Australia",
    countryCode: "AU",
    isoNumeric: "036",
    latitude: -27,
    longitude: 134,
    zoom: 2,
    stores: [
      { id: "au-sydney", name: "Bligh Street", city: "Sydney", latitude: -33.8671, longitude: 151.2092, address: "31 Bligh Street, Sydney NSW 2000", url: "/stores/au-sydney" },
      { id: "au-melbourne", name: "Collins Street", city: "Melbourne", latitude: -37.815, longitude: 144.966, address: "250 Collins Street, Melbourne VIC 3000", url: "/stores/au-melbourne" },
    ],
  },
];
