
class Bookchain {
    constructor(routerHost, newBlockCallback, loadingInfoCallback) {

        this.routerHost = routerHost;
        this.routerUrl = 'https://' + routerHost ;
        this.identity = null;
        this.epoch = null;
        this.token = null;
        this.blocks = [];
        this.receivedBlocks = false;
        this.consumingQueue = false;
        this.busy = false;
        this.newBlockCallback = newBlockCallback;
        this.loadingInfoCallback = loadingInfoCallback;
    }

    peekMostRecentBlock() {
        if (this.blocks.length > 0) {
            return this.blocks[this.blocks.length - 1];
        }
        else {
            return null;
        }
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


function initialiseBookchain(routerHost, newBlockCallback, loadingInfoCallback) {
    let bookchain = new Bookchain(routerHost, newBlockCallback, loadingInfoCallback);

    // initialiseTime begins a chain of callbacks that initialise
    // this Bookchain instance with an identity and the latest blocks
    requestIdentity(bookchain);
    return bookchain;

}


function requestIdentity(bookchain) {
    bookchain.loadingInfoCallback(
        0.1,
        'Node initialised. Requesting identity...'
    );
    bookchain.routerGetRequest('/register').then(
        function(data) {
            bookchain.loadingInfoCallback(
                0.2,
                'Successfully got identity: ' + data.identity
            );
            console.log('Successfully got identity: ' + data.identity);
            bookchain.identity = data['identity'];
            bookchain.epoch = data['epoch'];
            generateAuthToken(bookchain);
        },
        function (error) {
            console.log(
                '"/register" request failed. Code: ' + error.status
            );
            console.log('Retrying in 500 milliseconds...')
            setTimeout(function() {
                requestIdentity(bookchain);
            }, 500)
        }
    )
}

function generateAuthToken(bookchain) {
    console.log('Generating auth token...')
    bookchain.loadingInfoCallback(
        0.3,
        'Generating auth token...'
    );
    bookchain.getAuthToken().then(digestValue => {
        bookchain.token = hexString(digestValue);
        requestPartnerAddress(bookchain)
    });
}

function requestPartnerAddress(bookchain) {
    console.log('Attempting to pair...')
    bookchain.loadingInfoCallback(
        0.5,
        'Attempting to find another node...'
    );
    const pairUrl = '/pair' + bookchain.getAuthQueryString();
    bookchain.routerGetRequest(pairUrl).then(
        function(data) {
            console.log('Successfully got partner address! ' + data['address']);
            bookchain.loadingInfoCallback(
                0.6,
                'Got node address! ' + data['address']
            );
            sendBlocksRequest(bookchain, partnerAddress=data['address']);
        }, function (error) {
            console.log(
                '"/pair" request failed.' +
                'Could not get partner address. Status: ' + error.status
            );
            console.log('Retrying in 250 milliseconds...')
            setTimeout(function(){
                requestPartnerAddress(bookchain);
            }, 250);
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

            bookchain.loadingInfoCallback(
                0.7,
                'Request for blocks sent...'
            );
            if (bookchain.consumingQueue === false) {
                initialiseQueueConsumption(bookchain);
            }
            setTimeout(function() {
                checkReceivedBlocks(bookchain);
            }, 3000);
        },
        function (error) {
            console.log(
                '"/enqueue" request to send message for blocks failed.' +
                'Status: ' + error.status
            );
            console.log('Retrying in 500 milliseconds...')
            setTimeout(function() {
                sendBlocksRequest(bookchain, partnerAddress);
            }, 500);
        }
    )
}


function checkReceivedBlocks(bookchain) {
    if (bookchain.receivedBlocks) {
        bookchain.loadingInfoCallback(
            1,
            'Node ready.'
        );
    } else {
        bookchain.loadingInfoCallback(
            0.5,
            'No response received from partner node. Trying another... '
        );
        console.log('No response received from partner. Trying another... ')
        requestPartnerAddress(bookchain);
    }
}

function initialiseQueueConsumption(bookchain) {
    console.log('Starting to consume queue...')
    bookchain.consumingQueue = true;
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

    data = {
        'identity': bookchain.identity,
        'token': bookchain.token,
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
            }, 500);
        }
    )
}


function initialiseBlocks(bookchain, blocks) {
    bookchain.busy = true;
    console.log('Checking integrity of bookchain...')

        bookchain.loadingInfoCallback(
            0.8,
            'Checking integrity of bookchain...'
        );
    addBlocks(bookchain, blocks);
}

function addBlocks(bookchain, blocks) {
    if (blocks.length > 0) {
        const nextBlock = blocks.shift();
        addBlock(bookchain, nextBlock, blocks);

    } else {
        bookchain.busy = false;
        bookchain.receivedBlocks = true;
        bookchain.loadingInfoCallback(
            0.95,
            'All blocks processed.'
        );
    }
}

function addBlock(bookchain, block, blocks=null) {
    bookchain.busy = true;
    console.log('Validating new block...')

    let mostRecentBlock = bookchain.peekMostRecentBlock();

    if (mostRecentBlock === null) {
        // No hash to check as this is the genesis block
        bookchain.blocks.push(block);
        console.log(
            'Added genesis block ' + bookchain.blocks.length + ': ' +
             JSON.stringify(block)
        );
        bookchain.newBlockCallback();

        // Continue adding blocks in cases where there are many
        if (blocks !== null) {
            addBlocks(bookchain, blocks)
        } else {
            bookchain.busy = false;
        }

    }
    else {
        // This is a regular block
        getHash(getBlockString(mostRecentBlock)).then(digestValue => {
            let hexDigest = hexString(digestValue);

            if (block['hash'] === hexDigest) {
                bookchain.blocks.push(block);
                console.log(
                    'Validated and added block '
                     + bookchain.blocks.length + ': ' + JSON.stringify(block)
                );
                bookchain.newBlockCallback();

                // Continue adding blocks in cases where there are many
                if (blocks !== null) {
                    addBlocks(bookchain, blocks)
                } else {
                    bookchain.busy = false;
                }
            } else {
                console.log(
                    'Invalid block ignored: ' + JSON.stringify(block)
                );
                bookchain.loadingInfoCallback(
                    0.9,
                    'Hashes do not match! ' +
                    'Encountered invalid block. Ignoring remaining blocks.'
                );
                bookchain.busy = false;
                // Will allow node to continue with unsullied blocks
                bookchain.receivedBlocks = true;
            }
        });
    }
}

function sendNewBlock(bookchain, blockContent) {
    bookchain.busy = true;
    console.log('Submitting new block to network: ' + blockContent);

    let mostRecentBlock = bookchain.peekMostRecentBlock();
    postData = {
        'identity': bookchain.identity,
        'token': bookchain.token,
    };

    timestamp = new Date();

    // Check if there is a previous block
    if (mostRecentBlock === null) {
        // Proceed without a hash for the genesis block
        postData['data'] = JSON.stringify(
            {
                'type': 'ADD_BLOCK',
                'block': {
                    'text': blockContent,
                    'hash': null,
                    'timestamp': timestamp.toISOString(),
                },
            }
        )
        bookchain.routerPostRequest('/enqueue', postData).then(
            function(data) {
                console.log('Successfully sent new block.');
                bookchain.busy = false;
            },
            function (error) {
                console.log(
                    '"/enqueue" request to add block failed.' +
                    'Status: ' + error.status
                );
                console.log('Retrying in 200 milliseconds...')
                setTimeout(function() {
                    sendNewBlock(bookchain, blockContent);
                }, 500);
            }
        );
    }
    else {
        // Get the hash of the previous block
        getHash(getBlockString(mostRecentBlock)).then(digestValue => {
            let hexDigest = hexString(digestValue);
            postData['data'] = JSON.stringify(
                {
                    'type': 'ADD_BLOCK',
                    'block': {
                        'text': blockContent,
                        'hash': hexDigest,
                        'timestamp': timestamp.toISOString(),
                    },
                }
            );
            bookchain.routerPostRequest('/enqueue', postData).then(
                function(data) {
                    console.log('Successfully sent new block.');
                    bookchain.busy = false;
                },
                function (error) {
                    console.log(
                        '"/enqueue" request to add block failed.' +
                        'Status: ' + error.status
                    );
                    console.log('Retrying in 200 milliseconds...')
                    setTimeout(function() {
                        sendNewBlock(bookchain, blockContent);
                    }, 500);
                }
            );
        });
    }

}

function getBlockString(block) {
    let blockHash = 'null';
    if (block.hash !== null) {
        blockHash = block.hash;
    }
    return blockHash + block.text + block.timestamp;
}
