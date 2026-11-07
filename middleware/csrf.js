
const { csrfSync } = require("csrf-sync");

const {
    generateToken,
    csrfSynchronisedProtection
} = csrfSync({
    getTokenFromRequest: (req) => {
        return req.body?._csrf || req.headers["x-csrf-token"];
    }
});

module.exports = {
    generateToken,
    csrfSynchronisedProtection
};
