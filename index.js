const fs = require('fs')
const express = require('express')
// block:start:importing-sdk
const { Juspay, APIError } = require('expresscheckout-nodejs')
// block:end:importing-sdk
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

/**
 * Setup expresscheckout-node sdk
 */
// const SANDBOX_BASE_URL = "https://smartgatewayuat.hdfcbank.com"
// const PRODUCTION_BASE_URL = "https://smartgateway.hdfcbank.com"

/**
 * Read config.json file
 */
const config = require('./config.json')
const path = require('path')
const publicKey = fs.readFileSync(config.PUBLIC_KEY_PATH)
const privateKey = fs.readFileSync(config.PRIVATE_KEY_PATH)
const paymentPageClientId = config.PAYMENT_PAGE_CLIENT_ID // used in orderSession request

// Select base URL based on environment
const baseUrl = config.ENV === 'production' ? config.PRODUCTION_BASE_URL : config.SANDBOX_BASE_URL

/*
Juspay.customLogger = Juspay.silentLogger
*/
const juspay = new Juspay({
    merchantId: config.MERCHANT_ID,
    baseUrl: baseUrl,
    jweAuth: {
        keyId: config.KEY_UUID,
        publicKey,
        privateKey
    }
})

/**
 * initialize server
 */
const app = express()
const port = config.PORT || process.env.PORT || 5000

app.use(express.urlencoded({ extended: true }))
app.use(express.json())

/**
 * route:- initiateJuspayPayment
 */

// block:start:session-function
app.post('/initiateJuspayPayment', async (req, res) => {
    const orderId = req.body.order_id || "Order_123";
    const amount = req.body.amount || 1;

    // makes return url
    const returnUrl = config.RETURN_URL
    console.log("returnUrl", returnUrl)

    try {
        const sessionResponse = await juspay.orderSession.create({
            order_id: orderId,
            amount: amount,
            payment_page_client_id: paymentPageClientId,                    // [required] shared with you, in config.json
            customer_id: 'hdfc-testing-customer-one',                       // [optional] your customer id here
            action: 'paymentPage',                                          // [optional] default is paymentPage
            return_url: returnUrl,                                          // [optional] default is value given from dashboard
            currency: 'INR'                                                 // [optional] default is INR
        })

        // removes http field from response, typically you won't send entire structure as response
        return res.json(makeJuspayResponse(sessionResponse))
    } catch (error) {
        if (error instanceof APIError) {
            // handle errors comming from juspay's api
            return res.json(makeError(error.message))
        }
        return res.json(makeError())
    }
})
 // block:end:session-function

// block:start:order-status-function
app.post('/handleJuspayResponse', async (req, res) => {
    const orderId = req.body.order_id || req.body.orderId

    if (orderId == undefined) {
        return res.json(makeError('order_id not present or cannot be empty'))
    }

    try {
        const statusResponse = await juspay.order.status(orderId)
        const orderStatus = statusResponse.status
        let message = ''
        switch (orderStatus) {
            case "CHARGED":
                message = "order payment done successfully"
                break
            case "PENDING":
            case "PENDING_VBV":
                message = "order payment pending"
                break
            case "AUTHORIZATION_FAILED":
                message = "order payment authorization failed"
                break
            case "AUTHENTICATION_FAILED":
                message = "order payment authentication failed"
                break
            default:
                message = "order status " + orderStatus
                break
        }
        callback_url =config.ENV === 'production' ? config.CALLBACK_PRODUCTION_URL : config.CALLBACK_LOCAL_URL
        console.log("callback_url", callback_url)
        await fetch(callback_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(statusResponse)
        });

        // removes http field from response, typically you won't send entire structure as response
        return res.status(200).json({
            message: "Payment status received and is being processed.",
            order_id: orderId
        });
    } catch (error) {
        if (error instanceof APIError) {
            return res.status(502).json({ error: error.message });
        }
        return res.status(500).json({ error: "Internal server error" });
    }
})
// block:end:order-status-function


app.get('/', function(req,res) {
    return res.sendfile(path.join(__dirname, 'index.html'))
});

app.listen(port,  '0.0.0.0', () => {
    console.log(`Server is running on port 0.0.0.0:${port}`)
})

// Utitlity functions
function makeError(message) {
    return {
        message: message || 'Something went wrong'
    }
}

function makeJuspayResponse(successRspFromJuspay) {
    if (successRspFromJuspay == undefined) return successRspFromJuspay
    if (successRspFromJuspay.http != undefined) delete successRspFromJuspay.http
    return successRspFromJuspay
}
