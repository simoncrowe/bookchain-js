
class Bookchain {
    constructor(routerIp, routerPort, newBlockCallback) {

        this.routerIp = routerIp;
        this.routerPort = routerPort;
        this.routerUrl = 'http://' + routerIp + ':' + routerPort;
        this.identity = null;
        this.epoch = null;
        this.token = null;
        this.blocks = [];
        this.busy = false;
        this.newBlockCallback = newBlockCallback;
    }

    peekMostRecentBlock() {
        return this.blocks[this.blocks.length - 1];
    }

    routerGetRequest(path) {
        const fullUrl = this.routerUrl + path;
        return makeRequest('GET', fullUrl);
    }

    routerPostRequest(path, data) {
        const fullUrl = this.routerUrl + path;
        return makeRequest('POST', fullUrl, data);
    }

    getAuthToken() {
        return getHash(this.identity + '-' + this.epoch);
    }

    getAuthQueryString() {
        return '?identity=' + this.identity + '&token=' + this.token;
    }

}


function initialiseBookchain(routerIp, routerPort, secsFactor) {
    let bookchain = new Bookchain(routerIp, routerPort, secsFactor);

    // initialiseTime begins a chain of callbacks that initialise
    // this Bookchain instance with an identity and the latest blocks
    requestIdentity(bookchain);
    return bookchain;

}


function requestIdentity(bookchain) {
    bookchain.routerGetRequest('/register').then(
        function(data) {
            console.log('Successfully got identity: ' + data.identity);
            bookchain.identity = data['identity'];
            bookchain.epoch = data['epoch'];
            generateAuthToken(bookchain);
        },
        function (error) {
            console.log(
                '"/register" request failed. Code: ' + error.status
            );
            console.log('Retrying in 200 milliseconds...')
            setTimeout(function() {
                requestIdentity(bookchain);
            }, 200)
        }
    )
}

function generateAuthToken(bookchain) {
    console.log('Generating auth token...')
    bookchain.getAuthToken().then(digestValue => {
        bookchain.token = hexString(digestValue);
        requestPartnerAddress(bookchain)
    });
}

function requestPartnerAddress(bookchain) {
    console.log('Attempting to pair...')
    const pairUrl = '/pair' + bookchain.getAuthQueryString();
    bookchain.routerGetRequest(pairUrl).then(
        function(data) {
            console.log('Successfully got partner address! ' + data['address']);
            sendBlocksRequest(bookchain, partnerAddress=data['address']);
        }, function (error) {
            console.log(
                '"/pair" request failed.' +
                'Could not get partner address. Status: ' + error.status
            );
            console.log('Retrying in 200 milliseconds...')
            setTimeout(function(){
                requestPartnerAddress(bookchain);
            }, 200);
        }
    );
}

function sendBlocksRequest(bookchain, partnerAddress) {
    data = {
        'identity': bookchain.identity,
        'token': bookchain.token,
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
        },
        function (error) {
            console.log(
                '"/enqueue" request to send message for blocks failed.' +
                'Status: ' + error.status
            );
            console.log('Retrying in 200 milliseconds...')
            setTimeout(function() {
                sendBlocksRequest(bookchain, partnerAddress);
            }
            , 200);
        }
    )
}


function initialiseQueueConsumption(bookchain) {
    console.log('Starting to consume queue...')
    setInterval(function() {
        consumeQueue(bookchain);
    }, 1000);
}


function consumeQueue(bookchain) {
    if (!bookchain.busy) {
        const dequeueUrl = '/dequeue' + bookchain.getAuthQueryString();
        bookchain.routerGetRequest(dequeueUrl).then(
            function(message) {
                console.log('Dequeued message: ' + JSON.stringify(message));
                if (message['type'] === 'REQUEST_BLOCKS') {
                    sendPartnerBlocks(
                        bookchain,
                        partnerAddress=message['sender_address']
                    );
                }
                else if (message['type'] === 'RESPOND_BLOCKS') {
                    initialiseBlocks(bookchain, message['blocks']);
                }
                else if (message['type'] === 'ADD_BLOCK') {
                    addBlock(bookchain, message['block']);
                }
            },
            function (error) {
                if (error.status === 404) {
                    console.log('No data to dequeue.')
                    bookchain.busy = false;
                }
                else{
                    console.log(
                        '"/dequeue" request failed. Status: ' + error.status
                    );
                    console.log('Retrying in 1 second...');
                }
            }
        );
    }
}


function sendPartnerBlocks(bookchain, partnerAddress) {
    bookchain.busy = true;
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
                bookchain.busy = false;
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


function initialiseBlocks(bookchain, blocks) {
    bookchain.busy = true;
    console.log('Checking integrity of blockchain...')
    if (blocks.length > 0) {
        // Add the "genesis block".
        this.blocks.push(blocks.shift());
        console.log('Added genesis block:' +  block)
    }
    setBlocks(bookchain, blocks);
}

function setBlocks(bookchain, blocks) {
    if (blocks.length > 0) {
        const nextBlock = blocks.shift()
        getHash(nextBlock).then(digestValue => {
            const hexDigest = hexString(digestValue);
            if (blockchain.peekMostRecentBlock()['hash'] === hexDigest) {
                blockchain.push(nextBlock);
                setBlocks(blockchain, blocks);
            } else {
                console.log(
                    'Block ' + blockchain.blocks.length() +
                    ' has invalid hash. Ignoring this and subsequent blocks.'
                );
            }
        });
    } else {
        bookchain.busy = false;
    }
}

function setBlock(block) {
    bookchain.busy = true;
    console.log('Validating new block...')

    getHash(block).then(digestValue => {
        const hexDigest = hexString(digestValue);
        if (blockchain.peekMostRecentBlock()['hash'] === hexDigest) {
            blockchain.push(block);
            console.log(
                'Validated and added block ' + this.blocks.length + ': ' + block
            );
            bookchain.newBlockCallback();
            bookchain.busy = false;
        } else {
            console.log(
                'Invalid block ignored: ' + block
            );
            bookchain.busy = false;
        }
    });
}

function sendNewBlock(bookchain, blockContent) {
    console.log('Submitting new block to network: ' + blockContent);
}

