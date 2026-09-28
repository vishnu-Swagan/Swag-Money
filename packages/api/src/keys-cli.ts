import { bytesToB64Url, generateEd25519KeyPair } from '@swag-money/crypto'

const signing = generateEd25519KeyPair()
const session = bytesToB64Url(crypto.getRandomValues(new Uint8Array(32)))

process.stdout.write(`SWAG_SIGNING_PRIVATE_KEY=${bytesToB64Url(signing.privateKey)}\n`)
process.stdout.write(`SWAG_SESSION_SECRET=${session}\n`)
