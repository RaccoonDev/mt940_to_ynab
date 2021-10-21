require('dotenv').config()
const mt940 = require('mt940-js')
const fs = require('fs')

const ynab = require('ynab')

const yargs = require('yargs')
const argv = yargs
    .option('filepath', {
        alias: 'f',
        description: 'Path to MT940 encoded file',
        type: 'string'
    })
    .option('upload', {
        alias: 'u',
        description: 'Set this flag to upload data to YNAB',
        type: 'boolean'
    })
    .option('date', {
        alias: 'd',
        description: 'Date of transactions to upload',
        default: null,
        type: 'string'
    })
    .help()
    .alias('help', 'h')
    .argv;

const readMt = async (filepath, date) => {
    const content = fs.readFileSync(filepath)
    const statements = await mt940.read(content)

    const transactions = statements.flatMap(s => s.transactions)

    const filtered = !!date
        ? transactions.filter(s => s.valueDate === date)
        : transactions

    return filtered
}

function mapTransactionsFromMtToYnab(accountId, transactions) {
    return transactions.map( t => (
        { 
           account_id: accountId, 
           date: t.valueDate,
           amount: (t.isExpense ? -1 * t.amount : t.amount) * 1000,
           memo: t.description.substring(0, 200)
       }
   ))
}

function uploadTransactionsToYnab(transactions) {

    const accessToken = process.env.YNAB_ACCESS_TOKEN
    const ynabAPI = new ynab.API(accessToken)
    const budgetId = process.env.YNAB_BUDGET_ID

    ynabAPI.transactions
        .bulkCreateTransactions(budgetId, { transactions: transactions })
        .catch(e => {
            const error = e.error;
            console.log(`ERROR: id=${error.id}; name=${error.name}; detail: ${error.detail}`)
        })
}

async function main(filepath, upload, date) {
    const transactions = await readMt(filepath, date);

    if(transactions && transactions.length > 0) {

        const accountId = process.env.YNAB_ACCOUNT_ID
        const mappedTransactions = mapTransactionsFromMtToYnab(accountId, transactions)
        console.log(`About to send this transactions (${mappedTransactions.length}): `, mappedTransactions)
        if(upload) {
            await uploadTransactionsToYnab(mappedTransactions) 
        } else {
            console.log('upload is disabled, to enable the upload, add -u flag')
        }
    }
}

try {
    main(argv.filepath, argv.upload, argv.date)
} catch (e) {
    console.log('Error uploading transactions: ', e)
    process.exit(1)   
}
