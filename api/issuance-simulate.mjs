import {simulateIssuance} from '../public/capital.mjs';

export default function handler(request, response) {
  response.setHeader('cache-control', 'no-store');
  if (request.method !== 'POST') {
    response.setHeader('allow', 'POST');
    return response.status(405).json({message: 'Use POST.'});
  }
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return response.status(415).json({message: 'Use application/json.'});
  }
  if (Number(request.headers['content-length']) > 4096) {
    return response.status(413).json({message: 'Request is too large.'});
  }
  try {
    const input = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    return response.status(200).json(simulateIssuance(input));
  } catch (error) {
    return response.status(400).json({message: error instanceof SyntaxError ? 'Invalid JSON.' : error.message});
  }
}
