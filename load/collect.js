// k6 run load/collect.js -e TARGET=http://localhost:4100 -e KEY=pk_... -e ORIGIN=https://shop.example.ma
//
// From a single machine, every request comes from one address: start the ingestion with a high
// RATE_LIMIT_PER_MINUTE (for instance 1000000), or the limiter answers 429 as designed.
//
// Ramps up to 300 virtual users sending real-looking batches, as sendBeacon does. The thresholds
// encode the objective of the specification: p99 under 20 ms and no failed request.
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    beacons: {
      executor: 'ramping-arrival-rate',
      startRate: 100,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 300,
      stages: [
        { target: 1000, duration: '30s' },
        { target: 2000, duration: '1m' },
        { target: 0, duration: '15s' },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(99)<20'],
    http_req_failed: ['rate<0.001'],
  },
};

const PAGES = ['/', '/produits/:id', '/panier', '/commande'];
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function session() {
  let id = '';
  for (let index = 0; index < 22; index += 1) id += ALPHABET[Math.floor(Math.random() * 64)];
  return id;
}

export default function () {
  const body = JSON.stringify({
    v: 1,
    k: __ENV.KEY,
    s: session(),
    p: PAGES[Math.floor(Math.random() * PAGES.length)],
    ev: [
      { t: 'view', nt: 'navigate' },
      { t: 'vital', n: 'LCP', v: 800 + Math.random() * 4000 },
      { t: 'vital', n: 'CLS', v: Math.random() * 0.3 },
      { t: 'vital', n: 'INP', v: 40 + Math.random() * 400 },
    ],
  });
  const response = http.post(`${__ENV.TARGET}/v1/collect`, body, {
    headers: {
      'content-type': 'text/plain;charset=UTF-8',
      origin: __ENV.ORIGIN,
      'user-agent':
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36',
    },
  });
  check(response, { accepted: (r) => r.status === 204 });
}
