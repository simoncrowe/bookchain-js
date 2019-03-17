
class Bookchain {
    constructor(routerIp, routerPort, secsFactor) {

        this.routerIp = routerIp;
        this.routerPort = routerPort;
        this.routerUrl = 'http://' + routerIp + ':' + routerPort;
        this.identity = null;
        this.blocks = [];
        this.secsFactor = secsFactor;
        this.secs = 0;

        this.textEncoder = new TextEncoder();
    }

    routerGetRequest(path) {
        const fullUrl = this.routerUrl + path;
        return makeRequest('GET', fullUrl)
    }

    routerPostRequest(path, data) {
        const fullUrl = this.routerUrl + path;
        return makeRequest('POST', fullUrl, data)
    }

    getAuthQueryString(token) {
        return '?identity=' + this.identity + '&token=' + token;
    }

    getAuthToken() {
        const tokenDataString = this.identity + '-' + this.secs;
        // console.log('Generating token for ' + this.identity + ' at time: ' + this.secs)
        const tokenData = this.textEncoder.encode(tokenDataString);
        return window.crypto.subtle.digest('SHA-256', tokenData);
    }
}


function initialiseBookchain(routerIp, routerPort, secsFactor) {
    let bookchain = new Bookchain(routerIp, routerPort, secsFactor);

    // initialiseTime begins a chain of callbacks that initialise
    // this Bookchain instance with an identity and the latest blocks
    initialiseTime(bookchain);

}


function initialiseTime(bookchain) {
    bookchain.routerGetRequest('/secs').then(
        function(data) {
            console.log('Successfully got secs: ' + data);
            initialiseSecsIncrement(bookchain, seconds=data);
        }, function (error) {
            console.log(
                '"/secs" request failed.' +
                'Could not get secs: ' + error.status
            );
        }
    )
}

function initialiseSecsIncrement(bookchain, seconds) {
    bookchain.secs = seconds;
    setInterval(function() {
        bookchain.secs += bookchain.secsFactor;
    }, bookchain.secsFactor * 1000);
    requestIdentity(bookchain);
}


function requestIdentity(bookchain) {
    bookchain.routerGetRequest('/register').then(
        function(data) {
            console.log('Successfully got identity: ' + data.identity);
            bookchain.identity = data['identity'];
            requestPartnerAddress(bookchain);
        }, function (error) {
            console.log(
                '"/register" request failed. Code: ' + error.status
            );
        }
    )
}


function requestPartnerAddress(bookchain) {
    bookchain.getAuthToken().then(digestValue => {
        const hexDigest = hexString(digestValue);
        const pairUrl = '/pair' + bookchain.getAuthQueryString(token=hexDigest);
        bookchain.routerGetRequest(pairUrl).then(
            function(data) {
                console.log('Successfully got partner address! ' + data['address']);
                sendBlocksRequest(bookchain, partnerAddress=data['address']);
            }, function (error) {
                console.log(
                '"/pair" request failed.' +
                'Could not get partner address. Status: ' + error.status
                );
            }
        );

    });
}

function sendBlocksRequest(bookchain, partnerAddress) {
    bookchain.getAuthToken().then(digestValue => {
        const hexDigest = hexString(digestValue);
        data = {
            'identity': bookchain.identity,
            'token': hexDigest,
            'address': partnerAddress,
            'data': JSON.stringify(
                {
                    'type': 'REQUEST_BLOCKS',
                    'sender_address': bookchain.identity,
                }
            )
        }
        bookchain.routerPostRequest('/enqueue', data).then(
            function(data) {
                console.log('Successfully sent request for blocks.');
                initialiseQueueConsumption(bookchain);
            }, function (error) {
                console.log(
                    '"/enqueue" request to send message for blocks failed.' +
                    'Status: ' + error.status
                );
            }
        )
    });
}


function initialiseQueueConsumption(bookchain) {
    console.log('Starting to consume queue...')
    setInterval(function() {
        consumeQueue(bookchain);
    }, 1000);
}


function  consumeQueue(bookchain) {
    bookchain.getAuthToken().then(digestValue => {
        const hexDigest = hexString(digestValue);
        const dequeueUrl = '/dequeue' + bookchain.getAuthQueryString(token=hexDigest);
        bookchain.routerGetRequest(dequeueUrl).then(
            function(data) {
                console.log('Dequeued data: ' + JSON.stringify(data));
                if (data['type'] === 'REQUEST_BLOCKS') {
                    sendPartnerBlocks(
                        bookchain,
                        partnerAddress=data['sender_address']
                    );
                }
                else if (data['type' === 'RESPOND_BLOCKS') {
                    setBlocks(bookchain, data['blocks'])
                }
            }, function (error) {
                if (error.status === 404) {
                    console.log('No data to dequeue.')
                }
                else{
                    console.log(
                        '"/dequeue" request failed. Status: ' + error.status
                    );
                }
            }
        );
    });
}


function sendPartnerBlocks(bookchain, partnerAddress) {
    bookchain.getAuthToken().then(digestValue => {
        const hexDigest = hexString(digestValue);

        data = {
            'identity': bookchain.identity,
            'token': hexDigest,
            'address': partnerAddress,
            'data':  JSON.stringify(
                {
                    'type': 'RESPOND_BLOCKS',
                    'sender_address': bookchain.identity,
                    'blocks': bookchain.blocks,
                }
            )
        }
        bookchain.routerPostRequest('/enqueue', data).then(
            function(data) {
                console.log('Successfully sent requested blocks.');
                bookchain.dequeueOut();
            }, function (error) {
                console.log(
                    '"/enqueue" request to send message for blocks failed.' +
                    'Status: ' + error.status
                );
                setTimeout(function(){
                    console.log('Retrying sending blocks...')
                    sendPartnerBlocks(bookchain, partnerAddress);
                }, 200);
            }
        )
    });
}

function setBlocks(bookchain, blocks) {
    console.log('Checking integrity of blockchain...')
    for (i=0; i > blocks.length; i++) {
        // Evaluate each block before adding it.
        // Ensure hashes are consistent.
        bookchain.blocks.push(blocks[i]);
    }
}



function makeRequest (method, url, data) {
    return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open(method, url);
        xhr.onload = function () {
            if (this.status >= 200 && this.status < 300) {
                if (xhr.response === '') {
                    resolve('')
                }
                else {
                    resolve(JSON.parse(xhr.response));
                }
            }
            else {
                reject({
                    status: this.status,
                    statusText: xhr.statusText
                });
            }
        };
        xhr.onerror = function () {
            reject({
                status: this.status,
                statusText: xhr.statusText
            });
        };

        if (method === 'POST') {
            xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
            xhr.send(JSON.stringify(data))
        } else {
            xhr.send();
        }
    });
}


function hexString(buffer) {
    const byteArray = new Uint8Array(buffer);
        const hexCodes = [...byteArray].map(value => {
        const hexCode = value.toString(16);
        const paddedHexCode = hexCode.padStart(2, '0');
        return paddedHexCode;
    });

    return hexCodes.join('');
}
