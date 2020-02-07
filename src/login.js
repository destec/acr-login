const core = require('@actions/core');
const io = require('@actions/io');
const { issueCommand } = require('@actions/core/lib/command');

const path = require('path');
const fs = require('fs');
const ROAClient = require('@alicloud/pop-core').ROAClient;
const RPCClient = require('@alicloud/pop-core').RPCClient;


function getAPIEndpoint(regionId) {
    return `https://cr.${regionId}.aliyuncs.com`
}

function getRegistryEndpoint(regionId) {
    return `https://registry.${regionId}.aliyuncs.com`
}

async function run() {
    let accessKeyId = core.getInput('access-key-id', { required: false });
    let accessKeySecret = core.getInput('access-key-secret', { required: false });
    let username = core.getInput('username', { required: false });
    let password = core.getInput('password', { required: false });
    let regionId = core.getInput('region-id', { required: false });
    let instanceId = core.getInput('instance-id', { required: false });
    let loginServer = core.getInput('login-server', { required: false });

    if (accessKeyId.length > 0) {
        if (regionId.length == 0) {
            core.setFailed(`Action failed for region-id is missing`);
        }
        
        endpoint = getAPIEndpoint(regionId);

        if (instanceId.length == 0) {

            if (loginServer.length == 0) {
                loginServer = getRegistryEndpoint(regionId)
            }

            console.log('Getting tokens for temp user by access key ...');
            var client = new ROAClient({
                accessKeyId,
                accessKeySecret,
                endpoint: endpoint,
                apiVersion: '2016-06-07'
            });

            try {
                let result = await client.request('GET', '/tokens')
                username = result.data.tempUserName
                password = result.data.authorizationToken
            } catch (err) {
                core.setFailed(`Action failed to get authorization token with error: ${err}`);
            }
        } else {
            console.log(`Getting tokens for temp user by access key for instance ${instanceId} ...`);
            var client = new RPCClient({
                accessKeyId,
                accessKeySecret,
                endpoint: endpoint,
                codes: ['success'], 
                apiVersion: '2018-12-01'
            });
            try {
                let result = await client.request("GetAuthorizationToken", {
                    InstanceId: instanceId,
                    RegionId: regionId
                });
                username = result.TempUsername
                password = result.AuthorizationToken
            } catch (err) {
                core.setFailed(`Action failed to get authorization token with error: ${err}`);
            }
        }
    }

    if (loginServer.length == 0) {
        loginServer = 'https://index.docker.io/v1/';
    }

    let authenticationToken = Buffer.from(`${username}:${password}`).toString('base64');

    let config = {
        "auths": {
            [loginServer]: {
                auth: authenticationToken
            }
        }
    }

    const runnerTempDirectory = process.env['RUNNER_TEMP']; // Using process.env until the core libs are updated
    const dirPath = path.join(runnerTempDirectory, `docker_login_${Date.now()}`);
    await io.mkdirP(dirPath);
    const dockerConfigPath = path.join(dirPath, `config.json`);
    core.debug(`Writing docker config contents to ${dockerConfigPath}`);
    fs.writeFileSync(dockerConfigPath, JSON.stringify(config));
    issueCommand('set-env', { name: 'DOCKER_CONFIG' }, dirPath);
    console.log('DOCKER_CONFIG environment variable is set');
}

run().catch(core.setFailed);