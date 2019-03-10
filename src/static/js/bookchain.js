
class Bookchain {
    constructor(routerIp, routerPort, secsFactor) {

        this.routerIp = routerIp;
        this.routerPort = routerPort;
        this.routerUrl = 'http://' + routerIp + ':' + routerPort
        this.identity = null
        this.blocks = []
        this.secsFactor = secsFactor;
        this.secs = 0
    }

    incrementSecs() {
        this.secs += this.secsFactor;
    }

    routerGetRequest(path, authenticated=false) {
        let fullUrl = this.routerUrl + path
        if (authenticated) {
            fullUrl = fullUrl + this.getAuthQueryString()
        }

        return makeRequest('GET', fullUrl)
    }

    getAuthQueryString() {
        token = this.getAuthToken()
        return '?identity=' + this.identity + '&token=' + token;
    }

    getAuthToken() {
        return window.crypto.subtle.digest(
            'SHA-256', this.identity + '-' + this.secs
        )
    }

    enqueueMessage(message, recipient) {

    }

}


function initialiseBookchain(routerIp, routerPort, secsFactor) {
    let bookchain = new Bookchain(routerIp, routerPort, secsFactor)

    // initialiseTime begins a chain of callbacks that initialise
    // this Bookchain instance with an identity and the latest blocks
    initialiseTime(bookchain)

}

function initialiseTime(bookchain) {
    bookchain.routerGetRequest('/secs').then(
        function(data) {
            console.log('Successfully got secs: ' + data)
            bookchain.secs = data
            setInterval(bookchain.incrementSecs, bookchain.secsFactor * 1000)
            requestIdentity(bookchain);
        }, function (error) {
            console.log(
                '"/secs" request failed.' +
                'Could not get secs: ' + error.status
            );
        }
    )
}


function requestIdentity(bookchain) {
    bookchain.routerGetRequest('/register').then(
        function(data) {
            console.log('Successfully got identity: ' + data.identity)
            bookchain.identity = data['identity']
            requestPartnerAddress(bookchain)
        }, function (error) {
            console.log(
                '"/register" request failed.' +
                'Could not get identity: ' + error.status
            );
        }
    )
}

function requestPartnerAddress(bookchain) {
    bookchain.routerGetRequest('/pair', authenticated=true).then(
        function(data) {
            console.log('Successfully got partner address!' + data['address']);
        }, function (error) {
            console.log(
            '"/pair" request failed.' +
            'Could not get partner address: ' + error.status
            );
        }
    );
}



function makeRequest (method, url) {
    return new Promise(function (resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.open(method, url);
        xhr.onload = function () {
            if (this.status >= 200 && this.status < 300) {
                resolve(JSON.parse(xhr.response));
            } else {
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
        xhr.send();
    });
}