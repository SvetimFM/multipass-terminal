const synthetics = require('Synthetics');
const log = require('SyntheticsLogger');
const syntheticsConfiguration = synthetics.getConfiguration();

const apiCanaryBlueprint = async function () {
  syntheticsConfiguration.setConfig({
    restrictedHeaders: [],
    restrictedUrlParameters: []
  });

  const apiEndpoint = process.env.API_ENDPOINT;
  
  // Test 1: Health check endpoint
  let healthCheckRequest = {
    hostname: apiEndpoint,
    method: 'GET',
    path: '/v1/health',
    port: 443,
    protocol: 'https:',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  };

  let healthCheckResponse = await synthetics.executeHttpStep(
    'Check health endpoint',
    healthCheckRequest,
    (res) => {
      return new Promise((resolve, reject) => {
        if (res.statusCode !== 200) {
          reject(`Health check failed with status code: ${res.statusCode}`);
        }
        let responseBody = '';
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseBody);
            if (parsed.status !== 'healthy') {
              reject('API reported unhealthy status');
            }
            resolve();
          } catch (error) {
            reject(`Failed to parse response: ${error.message}`);
          }
        });
      });
    }
  );

  // Test 2: Check API latency
  const startTime = Date.now();
  let projectsRequest = {
    hostname: apiEndpoint,
    method: 'GET',
    path: '/v1/projects',
    port: 443,
    protocol: 'https:',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': 'Bearer synthetic-test-token'
    }
  };

  await synthetics.executeHttpStep(
    'Check projects endpoint latency',
    projectsRequest,
    (res) => {
      return new Promise((resolve, reject) => {
        const latency = Date.now() - startTime;
        log.info(`API latency: ${latency}ms`);
        
        if (latency > 1000) {
          log.warn(`High API latency detected: ${latency}ms`);
        }
        
        // We expect 401 since we're using a fake token
        if (res.statusCode !== 401) {
          reject(`Unexpected status code: ${res.statusCode}`);
        }
        resolve();
      });
    }
  );

  // Test 3: Check static assets
  let staticAssetRequest = {
    hostname: apiEndpoint,
    method: 'GET',
    path: '/index.html',
    port: 443,
    protocol: 'https:',
    headers: {
      'Accept': 'text/html'
    }
  };

  await synthetics.executeHttpStep(
    'Check static assets',
    staticAssetRequest,
    (res) => {
      return new Promise((resolve, reject) => {
        if (res.statusCode !== 200 && res.statusCode !== 301) {
          reject(`Static asset check failed with status code: ${res.statusCode}`);
        }
        resolve();
      });
    }
  );
};

exports.handler = async () => {
  return await synthetics.runCanary(apiCanaryBlueprint);
};