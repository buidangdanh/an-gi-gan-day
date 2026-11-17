import assert from 'node:assert/strict';
import {currentDistanceMeters} from '../apps/web/app/current-distance';
assert.equal(currentDistanceMeters({lat:0,lng:0},{lat:0,lng:0}),0);
assert.equal(currentDistanceMeters({lat:0,lng:0},{lat:0,lng:1}),111195);
assert.equal(currentDistanceMeters({lat:21.0336,lng:105.8463},{lat:21.0336377,lng:105.8463792}),9);
assert.equal(currentDistanceMeters({lat:21.0336,lng:105.8463},{lat:null,lng:null}),null);
assert.equal(currentDistanceMeters({lat:100,lng:105},{lat:21,lng:105}),null);
assert.equal(currentDistanceMeters({lat:0,lng:179.9},{lat:0,lng:-179.9}),22239);
console.log('PASS: khoảng cách theo điểm hiện tại, điểm trùng, thiếu/sai tọa độ và qua kinh tuyến 180°.');
