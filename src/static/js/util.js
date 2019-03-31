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


const textEncoder = new TextEncoder();

function getHash(string) {
    const encodedString = textEncoder.encode(string);
    return window.crypto.subtle.digest('SHA-256', encodedString);
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
