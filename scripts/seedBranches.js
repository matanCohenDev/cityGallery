require('dotenv').config();
const mongoose = require('mongoose');
const Branch = require('../models/galleryBranches_model');

const MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cityGallery';

const MOCK_BRANCHES = [
  {
    name: 'Tel Aviv Art Museum',
    address: '27 Shaul Hamelech Blvd, Tel Aviv, Israel',
    coordinates: { lat: 32.077046, lng: 34.786738 },
  },
  {
    name: 'Louvre Museum',
    address: 'Rue de Rivoli, 75001 Paris, France',
    coordinates: { lat: 48.860611, lng: 2.337644 },
  },
  {
    name: 'MoMA',
    address: '11 W 53rd St, New York, NY 10019, USA',
    coordinates: { lat: 40.761433, lng: -73.977622 },
  },
  {
    name: 'Tate Modern',
    address: 'Bankside, London SE1 9TG, UK',
    coordinates: { lat: 51.507595, lng: -0.099356 },
  },
  {
    name: 'Mori Art Museum',
    address: 'Roppongi Hills, Tokyo, Japan',
    coordinates: { lat: 35.660484, lng: 139.729249 },
  },
  {
    name: 'MCA Sydney',
    address: '140 George St, The Rocks NSW 2000, Australia',
    coordinates: { lat: -33.858732, lng: 151.210005 },
  },
];

(async () => {
  try {
    await mongoose.connect(MONGO, { });
    console.log('connected to db');

    await Branch.deleteMany({});
    await Branch.insertMany(MOCK_BRANCHES);

    console.log('Mock galleries inserted!');
  } catch (err) {
    console.error('ERROR:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
