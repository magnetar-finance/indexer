import { log } from '@graphprotocol/graph-ts';
import { ERC20 } from '../../../generated/PoolFactory/ERC20';
import { Burn, Mint, Pool, Statistics, Swap, Token, Transaction } from '../../../generated/schema';
import {
    Swap as SwapEvent,
    Mint as MintEvent,
    Sync as SyncEvent,
    Burn as BurnEvent,
    Fees as FeesEvent,
    Transfer as TransferEvent,
} from '../../../generated/templates/Pool/V2Pool';
import { BD_ZERO, BI_ONE, BI_ZERO, ONE_ADDRESS, ZERO_ADDRESS } from '../../utils/constants';
import { divideByBase } from '../../utils/math';
import { loadBundlePrice, loadTokenPrice } from '../../utils/misc';
import {
    createLPPosition,
    updateOverallDayData,
    updatePoolDayData,
    updatePoolHourData,
    updateTokenDayData,
} from '../../utils/mutations';

export function handleSwap(event: SwapEvent): void {
    const pool = Pool.load(event.address.toHex()) as Pool;
    log.info('[V2Pool] handleSwap — pool: {}', [event.address.toHex()]);
    // Load eth price first
    loadBundlePrice();
    // Tokens
    let token0 = Token.load(pool.token0) as Token;
    let token1 = Token.load(pool.token1) as Token;
    // load token prices
    token0 = loadTokenPrice(token0);
    token1 = loadTokenPrice(token1);

    const amount0In = divideByBase(event.params.amount0In, token0.decimals);
    const amount1In = divideByBase(event.params.amount1In, token1.decimals);
    const amount0Out = divideByBase(event.params.amount0Out, token0.decimals);
    const amount1Out = divideByBase(event.params.amount1Out, token1.decimals);
    const amount0Total = amount0In.plus(amount0Out);
    const amount1Total = amount1In.plus(amount1Out);
    const amount0ETH = amount0Total.times(token0.derivedETH);
    const amount0USD = amount0Total.times(token0.derivedUSD);
    const amount1ETH = amount1Total.times(token1.derivedETH);
    const amount1USD = amount1Total.times(token1.derivedUSD);

    // Mutate pool
    pool.volumeETH = pool.volumeETH.plus(amount0ETH).plus(amount1ETH);
    pool.volumeUSD = pool.volumeUSD.plus(amount0USD).plus(amount1USD);
    pool.volumeToken0 = pool.volumeToken0.plus(amount0Total);
    pool.volumeToken1 = pool.volumeToken1.plus(amount1Total);
    pool.txCount = pool.txCount.plus(BI_ONE);
    log.debug('[auto] saving entity: {}', ['pool']);
    pool.save();

    token0.tradeVolume = token0.tradeVolume.plus(amount0Total);
    token0.tradeVolumeUSD = token0.tradeVolumeUSD.plus(amount0USD);
    token0.txCount = token0.txCount.plus(BI_ONE);
    log.debug('[auto] saving entity: {}', ['token0']);
    token0.save();

    token1.tradeVolume = token1.tradeVolume.plus(amount1Total);
    token1.tradeVolumeUSD = token1.tradeVolumeUSD.plus(amount1USD);
    token1.txCount = token1.txCount.plus(BI_ONE);
    log.debug('[auto] saving entity: {}', ['token1']);
    token1.save();

    // Transaction
    const hash = event.transaction.hash.toHex();
    let transaction = Transaction.load(hash);

    if (transaction == null) {
        transaction = new Transaction(hash);
        transaction.block = event.block.number;
        transaction.timestamp = event.block.timestamp;
        transaction.hash = event.transaction.hash;
        log.debug('[auto] saving entity: {}', ['transaction']);
        transaction.save();
    }

    const swapId = transaction.id + ':' + event.logIndex.toString();
    const swap = new Swap(swapId);
    swap.transaction = transaction.id;
    swap.timestamp = event.block.timestamp;
    swap.pool = pool.id;
    swap.sender = event.params.sender;
    swap.from = event.transaction.from;
    swap.to = event.params.to;
    swap.amount0In = amount0In;
    swap.amount1In = amount1In;
    swap.amount0Out = amount0Out;
    swap.amount1Out = amount1Out;
    swap.amountUSD = amount0USD.plus(amount1USD);
    swap.logIndex = event.logIndex;
    log.debug('[auto] saving entity: {}', ['swap']);
    swap.save();

    // Statistics
    const statistics = Statistics.load('1') as Statistics;
    statistics.totalTradeVolumeUSD = statistics.totalTradeVolumeUSD.plus(amount0USD).plus(amount1USD);
    statistics.totalTradeVolumeETH = statistics.totalTradeVolumeETH.plus(amount0ETH).plus(amount1ETH);
    statistics.txCount = statistics.txCount.plus(BI_ONE);
    log.debug('[auto] saving entity: {}', ['statistics']);
    statistics.save();

    const overallDayData = updateOverallDayData(event);
    const poolDayData = updatePoolDayData(event);
    const poolHourData = updatePoolHourData(event);
    const token0DayData = updateTokenDayData(token0, event);
    const token1DayData = updateTokenDayData(token1, event);

    overallDayData.feesUSD = overallDayData.feesUSD.plus(pool.totalFeesUSD);
    overallDayData.volumeETH = overallDayData.volumeETH.plus(amount0ETH).plus(amount1ETH);
    overallDayData.volumeUSD = overallDayData.volumeUSD.plus(amount0USD).plus(amount1USD);
    log.debug('[auto] saving entity: {}', ['overallDayData']);
    overallDayData.save();

    poolDayData.dailyVolumeToken0 = poolDayData.dailyVolumeToken0.plus(amount0Total);
    poolDayData.dailyVolumeToken1 = poolDayData.dailyVolumeToken1.plus(amount1Total);
    poolDayData.dailyVolumeETH = poolDayData.dailyVolumeETH.plus(amount0ETH).plus(amount1ETH);
    poolDayData.dailyVolumeUSD = poolDayData.dailyVolumeUSD.plus(amount0USD).plus(amount1USD);
    log.debug('[auto] saving entity: {}', ['poolDayData']);
    poolDayData.save();

    poolHourData.hourlyVolumeToken0 = poolHourData.hourlyVolumeToken0.plus(amount0Total);
    poolHourData.hourlyVolumeToken1 = poolHourData.hourlyVolumeToken1.plus(amount1Total);
    poolHourData.hourlyVolumeETH = poolHourData.hourlyVolumeETH.plus(amount0ETH).plus(amount1ETH);
    poolHourData.hourlyVolumeUSD = poolHourData.hourlyVolumeUSD.plus(amount0USD).plus(amount1USD);
    log.debug('[auto] saving entity: {}', ['poolHourData']);
    poolHourData.save();

    token0DayData.dailyVolumeToken = token0DayData.dailyVolumeToken.plus(amount0Total);
    token0DayData.dailyVolumeUSD = token0DayData.dailyVolumeUSD.plus(amount0USD);
    token0DayData.dailyVolumeETH = token0DayData.dailyVolumeETH.plus(amount0ETH);
    log.debug('[auto] saving entity: {}', ['token0DayData']);
    token0DayData.save();

    token1DayData.dailyVolumeToken = token1DayData.dailyVolumeToken.plus(amount1Total);
    token1DayData.dailyVolumeUSD = token1DayData.dailyVolumeUSD.plus(amount1USD);
    token1DayData.dailyVolumeETH = token1DayData.dailyVolumeETH.plus(amount1ETH);
    log.debug('[auto] saving entity: {}', ['token1DayData']);
    token1DayData.save();
}

export function handleMint(event: MintEvent): void {
    const pool = Pool.load(event.address.toHex()) as Pool;
    log.info('[V2Pool] handleMint — pool: {}', [event.address.toHex()]);
    // Load eth price first
    loadBundlePrice();
    // Tokens
    let token0 = Token.load(pool.token0) as Token;
    let token1 = Token.load(pool.token1) as Token;
    // load token prices
    token0 = loadTokenPrice(token0);
    token1 = loadTokenPrice(token1);

    // Amounts
    const amount0 = divideByBase(event.params.amount0, token0.decimals);
    const amount1 = divideByBase(event.params.amount1, token1.decimals);
    const amount0USD = amount0.times(token0.derivedUSD);
    const amount1USD = amount1.times(token1.derivedUSD);
    const amount0ETH = amount0.times(token0.derivedETH);
    const amount1ETH = amount1.times(token1.derivedETH);

    token0.txCount = token0.txCount.plus(BI_ONE);
    log.debug('[auto] saving entity: {}', ['token0']);
    token0.save();

    token1.txCount = token1.txCount.plus(BI_ONE);
    log.debug('[auto] saving entity: {}', ['token1']);
    token1.save();

    // Statistics
    const statistics = Statistics.load('1') as Statistics;
    statistics.txCount = statistics.txCount.plus(BI_ONE);
    log.debug('[auto] saving entity: {}', ['statistics']);
    statistics.save();

    pool.txCount = pool.txCount.plus(BI_ONE);
    log.debug('[auto] saving entity: {}', ['pool']);
    pool.save();

    // Transaction
    const hash = event.transaction.hash.toHex();
    let transaction = Transaction.load(hash);

    if (transaction == null) {
        transaction = new Transaction(hash);
        transaction.block = event.block.number;
        transaction.timestamp = event.block.timestamp;
        transaction.hash = event.transaction.hash;
        log.debug('[auto] saving entity: {}', ['transaction']);
        transaction.save();
    }

    const mintId = `mint-${transaction.id}`;
    const mint = Mint.load(mintId) as Mint;
    mint.amount0 = amount0;
    mint.amount1 = amount1;
    mint.amountUSD = amount0USD.plus(amount1USD);
    mint.sender = event.params.sender;
    mint.logIndex = event.logIndex;
    log.debug('[auto] saving entity: {}', ['mint']);
    mint.save();

    const overallDayData = updateOverallDayData(event);
    const poolDayData = updatePoolDayData(event);
    const poolHourData = updatePoolHourData(event);
    const token0DayData = updateTokenDayData(token0, event);
    const token1DayData = updateTokenDayData(token1, event);

    overallDayData.feesUSD = overallDayData.feesUSD.plus(pool.totalFeesUSD);
    overallDayData.volumeETH = overallDayData.volumeETH.plus(amount0ETH).plus(amount1ETH);
    overallDayData.volumeUSD = overallDayData.volumeUSD.plus(amount0USD).plus(amount1USD);
    log.debug('[auto] saving entity: {}', ['overallDayData']);
    overallDayData.save();

    poolDayData.dailyVolumeToken0 = poolDayData.dailyVolumeToken0.plus(amount0);
    poolDayData.dailyVolumeToken1 = poolDayData.dailyVolumeToken1.plus(amount1);
    poolDayData.dailyVolumeETH = poolDayData.dailyVolumeETH.plus(amount0ETH).plus(amount1ETH);
    poolDayData.dailyVolumeUSD = poolDayData.dailyVolumeUSD.plus(amount0USD).plus(amount1USD);
    log.debug('[auto] saving entity: {}', ['poolDayData']);
    poolDayData.save();

    poolHourData.hourlyVolumeToken0 = poolHourData.hourlyVolumeToken0.plus(amount0);
    poolHourData.hourlyVolumeToken1 = poolHourData.hourlyVolumeToken1.plus(amount1);
    poolHourData.hourlyVolumeETH = poolHourData.hourlyVolumeETH.plus(amount0ETH).plus(amount1ETH);
    poolHourData.hourlyVolumeUSD = poolHourData.hourlyVolumeUSD.plus(amount0USD).plus(amount1USD);
    log.debug('[auto] saving entity: {}', ['poolHourData']);
    poolHourData.save();

    token0DayData.dailyVolumeToken = token0DayData.dailyVolumeToken.plus(amount0);
    token0DayData.dailyVolumeUSD = token0DayData.dailyVolumeUSD.plus(amount0USD);
    token0DayData.dailyVolumeETH = token0DayData.dailyVolumeETH.plus(amount0ETH);
    log.debug('[auto] saving entity: {}', ['token0DayData']);
    token0DayData.save();

    token1DayData.dailyVolumeToken = token1DayData.dailyVolumeToken.plus(amount1);
    token1DayData.dailyVolumeUSD = token1DayData.dailyVolumeUSD.plus(amount1USD);
    token1DayData.dailyVolumeETH = token1DayData.dailyVolumeETH.plus(amount1ETH);
    log.debug('[auto] saving entity: {}', ['token1DayData']);
    token1DayData.save();
}

export function handleSync(event: SyncEvent): void {
    const pool = Pool.load(event.address.toHex()) as Pool;
    log.info('[V2Pool] handleSync — pool: {}, reserve0: {}, reserve1: {}', [
        event.address.toHex(),
        event.params.reserve0.toString(),
        event.params.reserve1.toString(),
    ]);
    // Load eth price first

    loadBundlePrice();

    // Tokens
    let token0 = Token.load(pool.token0) as Token;
    let token1 = Token.load(pool.token1) as Token;
    // Statistics
    const statistics = Statistics.load('1') as Statistics;
    statistics.totalVolumeLockedETH = statistics.totalVolumeLockedETH.minus(pool.reserveETH);
    statistics.totalVolumeLockedUSD = statistics.totalVolumeLockedUSD.minus(pool.reserveUSD);

    token0.totalLiquidity = token0.totalLiquidity.minus(pool.reserve0);
    token1.totalLiquidity = token1.totalLiquidity.minus(pool.reserve1);

    pool.reserve0 = divideByBase(event.params.reserve0, token0.decimals);
    pool.reserve1 = divideByBase(event.params.reserve1, token1.decimals);

    if (!pool.reserve1.equals(BD_ZERO)) pool.token0Price = pool.reserve0.div(pool.reserve1);
    else pool.token0Price = BD_ZERO;

    if (!pool.reserve0.equals(BD_ZERO)) pool.token1Price = pool.reserve1.div(pool.reserve0);
    else pool.token1Price = BD_ZERO;

    loadBundlePrice();
    // load token prices
    token0 = loadTokenPrice(token0);
    token1 = loadTokenPrice(token1);

    pool.reserveETH = pool.reserve0.times(token0.derivedETH).plus(pool.reserve1.times(token1.derivedETH));
    pool.reserveUSD = pool.reserve0.times(token0.derivedUSD).plus(pool.reserve1.times(token1.derivedUSD));

    statistics.totalVolumeLockedETH = statistics.totalVolumeLockedETH.plus(pool.reserveETH);
    statistics.totalVolumeLockedUSD = statistics.totalVolumeLockedUSD.plus(pool.reserveUSD);

    token0.totalLiquidity = token0.totalLiquidity.plus(pool.reserve0);
    token0.totalLiquidityETH = token0.totalLiquidity.times(token0.derivedETH);
    token0.totalLiquidityUSD = token0.totalLiquidity.times(token0.derivedUSD);

    token1.totalLiquidity = token1.totalLiquidity.plus(pool.reserve1);
    token1.totalLiquidityETH = token1.totalLiquidity.times(token1.derivedETH);
    token1.totalLiquidityUSD = token1.totalLiquidity.times(token1.derivedUSD);

    log.debug('[auto] saving entity: {}', ['pool']);

    pool.save();
    log.debug('[auto] saving entity: {}', ['statistics']);
    statistics.save();
    log.debug('[auto] saving entity: {}', ['token0']);
    token0.save();
    log.debug('[auto] saving entity: {}', ['token1']);
    token1.save();
}

export function handleBurn(event: BurnEvent): void {
    const pool = Pool.load(event.address.toHex()) as Pool;
    log.info('[V2Pool] handleBurn — pool: {}', [event.address.toHex()]);
    // Load eth price first

    loadBundlePrice();

    // Tokens
    const token0 = Token.load(pool.token0) as Token;
    const token1 = Token.load(pool.token1) as Token;
    const statistics = Statistics.load('1') as Statistics;

    const token0Amount = divideByBase(event.params.amount0, token0.decimals);
    const token1Amount = divideByBase(event.params.amount1, token1.decimals);

    token0.txCount = token0.txCount.plus(BI_ONE);
    token1.txCount = token1.txCount.plus(BI_ONE);

    const amountTotalUSD = token0Amount.times(token0.derivedUSD).plus(token1Amount.times(token1.derivedUSD));
    statistics.txCount = statistics.txCount.plus(BI_ONE);
    pool.txCount = pool.txCount.plus(BI_ONE);

    log.debug('[auto] saving entity: {}', ['token0']);

    token0.save();
    log.debug('[auto] saving entity: {}', ['token1']);
    token1.save();
    log.debug('[auto] saving entity: {}', ['pool']);
    pool.save();
    log.debug('[auto] saving entity: {}', ['statistics']);
    statistics.save();

    // Transaction
    const hash = event.transaction.hash.toHex();
    let transaction = Transaction.load(hash);

    if (transaction == null) {
        transaction = new Transaction(hash);
        transaction.block = event.block.number;
        transaction.timestamp = event.block.timestamp;
        transaction.hash = event.transaction.hash;
        log.debug('[auto] saving entity: {}', ['transaction']);
        transaction.save();
    }

    const burnId = `burn-${transaction.id}`;
    const burn = Burn.load(burnId) as Burn;
    burn.logIndex = event.logIndex;
    burn.amount0 = token0Amount;
    burn.amount1 = token1Amount;
    burn.amountUSD = amountTotalUSD;
    burn.sender = event.params.sender;
    log.debug('[auto] saving entity: {}', ['burn']);
    burn.save();

    updateOverallDayData(event);
    updatePoolDayData(event);
    updatePoolHourData(event);
    updateTokenDayData(token0, event);
    updateTokenDayData(token1, event);
}

export function handleFees(event: FeesEvent): void {
    const pool = Pool.load(event.address.toHex()) as Pool;
    log.info('[V2Pool] handleFees — pool: {}, amount0: {}, amount1: {}', [
        event.address.toHex(),
        event.params.amount0.toString(),
        event.params.amount1.toString(),
    ]);
    // Load eth price first

    loadBundlePrice();

    // Tokens
    let token0 = Token.load(pool.token0) as Token;
    let token1 = Token.load(pool.token1) as Token;
    const statistics = Statistics.load('1') as Statistics;

    token0 = loadTokenPrice(token0);
    token1 = loadTokenPrice(token1);

    const amount0 = divideByBase(event.params.amount0, token0.decimals);
    const amount1 = divideByBase(event.params.amount1, token1.decimals);
    const amountUSD = amount0.times(token0.derivedUSD).plus(amount1.times(token1.derivedUSD));

    pool.totalFees0 = pool.totalFees0.plus(amount0);
    pool.totalFees1 = pool.totalFees1.plus(amount1);
    pool.totalFeesUSD = pool.totalFeesUSD.plus(amountUSD);
    log.debug('[auto] saving entity: {}', ['pool']);
    pool.save();

    statistics.totalFeesUSD = statistics.totalFeesUSD.plus(amountUSD);
    log.debug('[auto] saving entity: {}', ['statistics']);
    statistics.save();
}

export function handleTransfer(event: TransferEvent): void {
    const pool = Pool.load(event.address.toHex()) as Pool;
    log.info('[V2Pool] handleTransfer — pool: {}, from: {}, to: {}', [
        event.address.toHex(),
        event.params.from.toHex(),
        event.params.to.toHex(),
    ]);
    // Load eth price first

    loadBundlePrice();
    // Pool contract
    const poolContract = ERC20.bind(event.address);
    const value = divideByBase(event.params.value);
    const hash = event.transaction.hash;
    const txId = hash.toHex();
    let transaction = Transaction.load(txId);

    if (transaction == null) {
        transaction = new Transaction(txId);
        transaction.block = event.block.number;
        transaction.timestamp = event.block.timestamp;
        transaction.hash = hash;
        log.debug('[auto] saving entity: {}', ['transaction']);
        transaction.save();
    }

    const isMint = event.params.from.toHex() == ZERO_ADDRESS && event.params.to.toHex() != ONE_ADDRESS;
    const isBurn = event.params.to.toHex() == ZERO_ADDRESS;

    if (isMint) {
        pool.totalSupply = pool.totalSupply.plus(value);
        log.debug('[auto] saving entity: {}', ['pool']);
        pool.save();

        const mintId = `mint-${transaction.id}`;
        const mint = new Mint(mintId);
        mint.transaction = transaction.id;
        mint.timestamp = event.block.timestamp;
        mint.pool = pool.id;
        mint.to = event.params.to;
        mint.liquidity = value;
        log.debug('[auto] saving entity: {}', ['mint']);
        mint.save();
    }

    if (event.params.to.toHex() == pool.id) {
        const burnId = `burn-${transaction.id}`;
        const burn = new Burn(burnId);
        burn.transaction = transaction.id;
        burn.pool = pool.id;
        burn.liquidity = value;
        burn.timestamp = transaction.timestamp;
        burn.sender = event.params.from;
        burn.to = event.params.to;
        burn.needsComplete = true;
        log.debug('[auto] saving entity: {}', ['burn']);
        burn.save();
    }

    if (isBurn && event.params.from.toHex() == pool.id) {
        pool.totalSupply = pool.totalSupply.minus(value);
        log.debug('[auto] saving entity: {}', ['pool']);
        pool.save();

        const burnId = `burn-${transaction.id}`;
        let burn = Burn.load(burnId);
        if (burn && burn.needsComplete) {
            burn.liquidity = value;
            burn.needsComplete = false;
            log.debug('[auto] saving entity: {}', ['burn']);
            burn.save();
        } else {
            burn = new Burn(burnId);
            burn.transaction = transaction.id;
            burn.pool = pool.id;
            burn.liquidity = value;
            burn.timestamp = transaction.timestamp;
            burn.sender = event.params.from;
            burn.to = event.params.to;
            burn.needsComplete = false;
            log.debug('[auto] saving entity: {}', ['burn']);
            burn.save();
        }
    }

    if (!isMint && event.params.from.toHex() != pool.id) {
        const userAddress = event.params.from;
        const balance = poolContract.try_balanceOf(userAddress);
        const amount = balance.reverted ? BI_ZERO : balance.value;
        createLPPosition(event, userAddress, amount, null);
    }

    if (!isBurn && event.params.to.toHex() != pool.id) {
        const userAddress = event.params.to;
        const balance = poolContract.try_balanceOf(userAddress);
        const amount = balance.reverted ? BI_ZERO : balance.value;
        createLPPosition(event, userAddress, amount, null);
    }
}
