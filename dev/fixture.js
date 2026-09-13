/*
 * The addresses the rig's Azure Maps stand-in answers with, in the shape the
 * `Address` object of Search 2026-01-01 is documented carrying — sparse on
 * purpose: one row has no region (a country without first-order subdivisions),
 * one has no postal code, one has no street number, and one has no position,
 * so the control's readers meet every absence the reference says is normal.
 *
 * Loaded by `harness.html` in a browser and by `host.js` in Node, so it
 * assigns both ways and depends on neither.
 */

(function (root, factory) {
    'use strict';

    var rows = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = rows;
    }

    if (root) {
        root.__pcfAddresses = rows;
    }
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    return [
        {
            addressLine: '1 Microsoft Way',
            streetNumber: '1',
            streetName: 'Microsoft Way',
            city: 'Redmond',
            region: { name: 'Washington', shortName: 'WA' },
            postalCode: '98052',
            countryIso: 'US',
            countryName: 'United States',
            formattedAddress: '1 Microsoft Way, Redmond, WA 98052, United States',
            position: { latitude: 47.64203, longitude: -122.13707 },
        },
        {
            addressLine: '1 Microsoft West Campus Rd',
            streetNumber: '1',
            streetName: 'Microsoft West Campus Rd',
            city: 'Redmond',
            region: { name: 'Washington', shortName: 'WA' },
            postalCode: '98052',
            countryIso: 'US',
            countryName: 'United States',
            formattedAddress: '1 Microsoft West Campus Rd, Redmond, WA 98052, United States',
            position: { latitude: 47.64409, longitude: -122.14155 },
        },
        {
            addressLine: '15127 NE 24th St',
            streetNumber: '15127',
            streetName: 'NE 24th St',
            city: 'Redmond',
            region: { name: 'Washington', shortName: 'WA' },
            postalCode: '98052',
            countryIso: 'US',
            countryName: 'United States',
            formattedAddress: '15127 NE 24th St, Redmond, WA 98052, United States',
            position: { latitude: 47.63177, longitude: -122.14049 },
        },
        // A country with no first-order subdivision: no `adminDistricts`.
        {
            addressLine: '1 Raffles Place',
            streetNumber: '1',
            streetName: 'Raffles Place',
            city: 'Singapore',
            region: null,
            postalCode: '048616',
            countryIso: 'SG',
            countryName: 'Singapore',
            formattedAddress: '1 Raffles Place, Singapore 048616',
            position: { latitude: 1.28406, longitude: 103.85128 },
        },
        // No postal code, and a street with no number.
        {
            addressLine: 'Rue de Rivoli',
            streetNumber: '',
            streetName: 'Rue de Rivoli',
            city: 'Paris',
            region: { name: 'Île-de-France', shortName: 'IDF' },
            postalCode: '',
            countryIso: 'FR',
            countryName: 'France',
            formattedAddress: 'Rue de Rivoli, Paris, Île-de-France, France',
            position: { latitude: 48.8606, longitude: 2.3376 },
        },
        // Geocodes to nothing: the pick lands, the coordinates do not.
        {
            addressLine: '10 Unmapped Lane',
            streetNumber: '10',
            streetName: 'Unmapped Lane',
            city: 'Nowhere',
            region: { name: 'Ohio', shortName: 'OH' },
            postalCode: '43000',
            countryIso: 'US',
            countryName: 'United States',
            formattedAddress: '10 Unmapped Lane, Nowhere, OH 43000, United States',
            position: null,
        },
    ];
});
