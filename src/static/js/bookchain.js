
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
            }, 200);
        }
    )
}


function initialiseBlocks(bookchain, blocks) {
    bookchain.busy = true;
    console.log('Checking integrity of bookchain...')
    addBlocks(bookchain, blocks);
}

function addBlocks(bookchain, blocks) {
    if (blocks.length > 0) {
        const nextBlock = blocks.shift();
        addBlock(bookchain, nextBlock);

    } else {
        bookchain.busy = false;
    }
}

function addBlock(bookchain, block) {
    bookchain.busy = true;
    console.log('Validating new block...')

    const mostRecentBlock = bookchain.peekMostRecentBlock();

    if (mostRecentBlock === null) {
        // No hash to check as this is the genesis block
        bookchain.blocks.push(block);
        console.log(
            'Added genesis block ' + bookchain.blocks.length + ': ' +
             JSON.stringify(block)
        );
        bookchain.newBlockCallback();
        bookchain.busy = false;

    }
    else {
        // This is a regular block
        getHash(JSON.stringify(mostRecentBlock)).then(digestValue => {
            const hexDigest = hexString(digestValue);

            if (block['hash'] === hexDigest) {
                bookchain.blocks.push(block);
                console.log(
                    'Validated and added block '
                     + bookchain.blocks.length + ': ' + JSON.stringify(block)
                );
                bookchain.newBlockCallback();
                bookchain.busy = false;
            } else {
                console.log(
                    'Invalid block ignored: ' + JSON.stringify(block)
                );
                bookchain.busy = false;
            }
        });
    }
}

function sendNewBlock(bookchain, blockContent) {
    bookchain.busy = true;
    console.log('Submitting new block to network: ' + blockContent);

    const mostRecentBlock = bookchain.peekMostRecentBlock();
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
                }, 200);
            }
        );
    }
    else {
        // Get the hash of the previous block
        getHash(JSON.stringify(bookchain.peekMostRecentBlock())).then(digestValue => {
            const hexDigest = hexString(digestValue);
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
                    }, 200);
                }
            );
        });
    }

}

