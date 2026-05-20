import { log } from 'matchstick-as';
import { Burn, CLPosition, Mint, Pool, Statistics, Swap, Token, Transaction } from '../../../generated/schema';
import { Swap as SwapEvent, Mint as MintEvent, Burn as BurnEvent } from '../../../generated/templates/CLPool/CLPool';
import { BD_ZERO, BI_ONE, BI_ZERO } from '../../utils/constants';
import { divideByBase } from '../../utils/math';
import { loadBundlePrice, loadTokenPrice } from '../../utils/misc';
import {
    createLPPosition,
    updateOverallDayData,
    updatePoolDayData,
    updatePoolHourData,
    updateTokenDayData,
} from '../../utils/mutations';
import { getItemFromStorage, nullifyItem, setItemInStorage } from '../../utils/storage';
import { BigInt } from '@graphprotocol/graph-ts';

export function handleSwap(event: SwapEvent): void {
    const pool = Pool.load(event.address.toHex()) as Pool;
    log.info('[CLPool] handleSwap — pool: {}', [event.address.toHex()]);
    loadBundlePrice();
    let token0 = Token.load(pool.token0) as Token;
    let token1 = Token.load(pool.token1) as Token;
    // Token prices
    token0 = loadTokenPrice(token0);
    token1 = loadTokenPrice(token1);
    // Balances before swap
    let reserve0 = pool.reserve0;
    let reserve1 = pool.reserve1;
    const isToken0Out = event.params.amount0.lt(BI_ZERO); // First token was sent out
    const amount0 = divideByBase(event.params.amount0.abs(), token0.decimals);
    const amount1 = divideByBase(event.params.amount1.abs(), token1.decimals);
    const amount0ETH = amount0.times(token0.derivedETH);
    const amount0USD = amount0.times(token0.derivedUSD);
    const amount1ETH = amount1.times(token1.derivedETH);
    const amount1USD = amount1.times(token1.derivedUSD);
    // After swap
    reserve0 = reserve0.plus(amount0);
    reserve1 = reserve1.plus(amount1);
    const reserveETH = reserve0.times(token0.derivedETH).plus(reserve1.times(token1.derivedETH));
    const reserveUSD = reserve0.times(token0.derivedUSD).plus(reserve1.times(token1.derivedUSD));
    const amount0In = isToken0Out ? BD_ZERO : amount0;
    const amount1In = isToken0Out ? amount1 : BD_ZERO;
    const amount0Out = isToken0Out ? amount0 : BD_ZERO;
    const amount1Out = isToken0Out ? BD_ZERO : amount1;

    pool.volumeETH = pool.volumeETH.plus(amount0ETH).plus(amount1ETH);
    pool.volumeUSD = pool.volumeUSD.plus(amount0USD).plus(amount1USD);
    pool.volumeToken0 = pool.volumeToken0.plus(amount0);
    pool.volumeToken1 = pool.volumeToken1.plus(amount1);
    pool.txCount = pool.txCount.plus(BI_ONE);
    pool.reserve0 = reserve0;
    pool.reserve1 = reserve1;
    pool.reserveETH = reserveETH;
    pool.reserveUSD = reserveUSD;

    if (!pool.reserve1.equals(BD_ZERO)) pool.token0Price = pool.reserve0.times(pool.reserve1);
    else pool.token0Price = BD_ZERO;
    if (!pool.reserve0.equals(BD_ZERO)) pool.token1Price = pool.reserve1.times(pool.reserve0);
    else pool.token1Price = BD_ZERO;

    pool.save();

    token0.tradeVolume = token0.tradeVolume.plus(amount0);
    token0.tradeVolumeUSD = token0.tradeVolumeUSD.plus(amount0USD);
    token0.txCount = token0.txCount.plus(BI_ONE);
    token0.save();

    token1.tradeVolume = token1.tradeVolume.plus(amount1);
    token1.tradeVolumeUSD = token1.tradeVolumeUSD.plus(amount1USD);
    token1.txCount = token1.txCount.plus(BI_ONE);
    token1.save();

    const hash = event.transaction.hash.toHex();
    let transaction = Transaction.load(hash);

    if (transaction == null) {
        transaction = new Transaction(hash);
        transaction.block = event.block.number;
        transaction.timestamp = event.block.timestamp;
        transaction.hash = event.transaction.hash;
        transaction.save();
    }

    const swapId = transaction.id + ':' + event.logIndex.toString();
    const swap = new Swap(swapId);
    swap.transaction = transaction.id;
    swap.timestamp = event.block.timestamp;
    swap.pool = pool.id;
    swap.sender = event.params.sender;
    swap.from = event.transaction.from;
    swap.to = event.params.recipient;
    swap.amount0In = amount0In;
    swap.amount1In = amount1In;
    swap.amount0Out = amount0Out;
    swap.amount1Out = amount1Out;
    swap.amountUSD = amount0USD.plus(amount1USD);
    swap.logIndex = event.logIndex;
    swap.save();
    log.debug('[CLPool] Swap saved — id: {}, amountUSD: {}', [swapId, swap.amountUSD.toString()]);

    // Statistics
    const statistics = Statistics.load('1') as Statistics;
    statistics.totalTradeVolumeUSD = statistics.totalTradeVolumeUSD.plus(amount0USD).plus(amount1USD);
    statistics.totalTradeVolumeETH = statistics.totalTradeVolumeETH.plus(amount0ETH).plus(amount1ETH);
    statistics.txCount = statistics.txCount.plus(BI_ONE);
    statistics.save();

    const overallDayData = updateOverallDayData(event);
    const poolDayData = updatePoolDayData(event);
    const poolHourData = updatePoolHourData(event);
    const token0DayData = updateTokenDayData(token0, event);
    const token1DayData = updateTokenDayData(token1, event);

    overallDayData.feesUSD = overallDayData.feesUSD.plus(pool.totalFeesUSD);
    overallDayData.volumeETH = overallDayData.volumeETH.plus(amount0ETH).plus(amount1ETH);
    overallDayData.volumeUSD = overallDayData.volumeUSD.plus(amount0USD).plus(amount1USD);
    overallDayData.save();

    poolDayData.dailyVolumeToken0 = poolDayData.dailyVolumeToken0.plus(amount0);
    poolDayData.dailyVolumeToken1 = poolDayData.dailyVolumeToken1.plus(amount1);
    poolDayData.dailyVolumeETH = poolDayData.dailyVolumeETH.plus(amount0ETH).plus(amount1ETH);
    poolDayData.dailyVolumeUSD = poolDayData.dailyVolumeUSD.plus(amount0USD).plus(amount1USD);
    poolDayData.save();

    poolHourData.hourlyVolumeToken0 = poolHourData.hourlyVolumeToken0.plus(amount0);
    poolHourData.hourlyVolumeToken1 = poolHourData.hourlyVolumeToken1.plus(amount1);
    poolHourData.hourlyVolumeETH = poolHourData.hourlyVolumeETH.plus(amount0ETH).plus(amount1ETH);
    poolHourData.hourlyVolumeUSD = poolHourData.hourlyVolumeUSD.plus(amount0USD).plus(amount1USD);
    poolHourData.save();

    token0DayData.dailyVolumeToken = token0DayData.dailyVolumeToken.plus(amount0);
    token0DayData.dailyVolumeUSD = token0DayData.dailyVolumeUSD.plus(amount0USD);
    token0DayData.dailyVolumeETH = token0DayData.dailyVolumeETH.plus(amount0ETH);
    token0DayData.save();

    token1DayData.dailyVolumeToken = token1DayData.dailyVolumeToken.plus(amount1);
    token1DayData.dailyVolumeUSD = token1DayData.dailyVolumeUSD.plus(amount1USD);
    token1DayData.dailyVolumeETH = token1DayData.dailyVolumeETH.plus(amount1ETH);
    token1DayData.save();
}

export function handleMint(event: MintEvent): void {
    const pool = Pool.load(event.address.toHex()) as Pool;
    log.info('[CLPool] handleMint — pool: {}, sender: {}', [event.address.toHex(), event.params.sender.toHex()]);
    const statistics = Statistics.load('1') as Statistics;
    let token0 = Token.load(pool.token0) as Token;
    let token1 = Token.load(pool.token1) as Token;

    // Load ETH price first
    loadBundlePrice();
    // Token prices
    token0 = loadTokenPrice(token0);
    token1 = loadTokenPrice(token1);

    const amount0 = divideByBase(event.params.amount0, token0.decimals);
    const amount1 = divideByBase(event.params.amount1, token1.decimals);
    const liquidity = divideByBase(event.params.amount);
    const amount0USD = amount0.times(token0.derivedUSD);
    const amount1USD = amount1.times(token1.derivedUSD);

    token0.txCount = token0.txCount.plus(BI_ONE);
    token0.totalLiquidity = token0.totalLiquidity.plus(amount0);
    token0.totalLiquidityUSD = token0.totalLiquidityUSD.plus(amount0USD);
    token0.totalLiquidityETH = token0.totalLiquidityETH.plus(amount0.times(token0.derivedETH));
    token0.save();

    token1.txCount = token1.txCount.plus(BI_ONE);
    token1.totalLiquidity = token1.totalLiquidity.plus(amount1);
    token1.totalLiquidityUSD = token1.totalLiquidityUSD.plus(amount1USD);
    token1.totalLiquidityETH = token1.totalLiquidityETH.plus(amount1.times(token1.derivedETH));
    token1.save();

    statistics.txCount = statistics.txCount.plus(BI_ONE);
    statistics.save();

    pool.txCount = pool.txCount.plus(BI_ONE);
    pool.reserve0 = pool.reserve0.plus(amount0);
    pool.reserve1 = pool.reserve1.plus(amount1);
    pool.reserveUSD = pool.reserveUSD.plus(amount0USD).plus(amount1USD);
    pool.reserveETH = pool.reserve0.times(token0.derivedETH).plus(pool.reserve1.times(token1.derivedETH));
    pool.totalSupply = pool.totalSupply.plus(liquidity);

    if (!pool.reserve1.equals(BD_ZERO)) pool.token0Price = pool.reserve0.times(pool.reserve1);
    else pool.token0Price = BD_ZERO;
    if (!pool.reserve0.equals(BD_ZERO)) pool.token1Price = pool.reserve1.times(pool.reserve0);
    else pool.token1Price = BD_ZERO;

    pool.save();

    const hash = event.transaction.hash.toHex();
    let transaction = Transaction.load(hash);

    if (transaction == null) {
        transaction = new Transaction(hash);
        transaction.block = event.block.number;
        transaction.timestamp = event.block.timestamp;
        transaction.hash = event.transaction.hash;
        transaction.save();
    }

    const mintId = `mint-${transaction.id}`;
    const mint = new Mint(mintId);
    mint.transaction = transaction.id;
    mint.timestamp = event.block.timestamp;
    mint.pool = pool.id;
    mint.sender = event.params.sender;
    mint.to = event.params.owner;
    mint.amount0 = amount0;
    mint.amount1 = amount1;
    mint.liquidity = liquidity;
    mint.amountUSD = amount0USD.plus(amount1USD);
    mint.logIndex = event.logIndex;
    mint.save();

    const tokenId = getItemFromStorage(transaction.id); // This should have been set in the NFPM mint handler

    if (tokenId == null) {
        log.warning(
            '[CLPool] handleMint — No token ID found in storage for transaction: {}. Cannot create LP position.',
            [transaction.id],
        );
        return;
    }

    const newUserId = getItemFromStorage(tokenId as string); // This should have been set in the NFPM mint handler

    if (newUserId == null) {
        log.warning('[CLPool] handleMint — No user ID found in storage for token ID: {}. Cannot create LP position.', [
            tokenId as string,
        ]);
        return;
    }

    const newLiquidity = getItemFromStorage(`new-liquidity:${tokenId as string}`); // This should have been set in the NFPM increaseLiquidity handler

    if (newLiquidity == null) {
        log.warning(
            '[CLPool] handleMint — No liquidity amount found in storage for token ID: {}. Cannot create LP position.',
            [tokenId as string],
        );
        return;
    }

    log.debug('[CLPool] Mint saved — pool: {}, amount0: {}, amount1: {}', [
        pool.id,
        amount0.toString(),
        amount1.toString(),
    ]);

    const clPosition = new CLPosition(tokenId as string);
    clPosition.pool = pool.id;
    clPosition.save();

    log.info('[CLPool] Creating LP position for new mint — tokenId: {}, owner: {}, liquidity: {}', [
        tokenId as string,
        event.params.owner.toHex(),
        newLiquidity as string,
    ]);

    const lpPosition = createLPPosition(
        event,
        event.params.owner,
        BigInt.fromString(newLiquidity as string),
        BigInt.fromString(tokenId as string),
    );
    lpPosition.account = newUserId;
    lpPosition.save();

    nullifyItem(tokenId as string);
    nullifyItem(`new-liquidity:${tokenId as string}`);
    nullifyItem(transaction.id);
}

export function handleBurn(event: BurnEvent): void {
    const pool = Pool.load(event.address.toHex()) as Pool;
    log.info('[CLPool] handleBurn — pool: {}, owner: {}', [event.address.toHex(), event.params.owner.toHex()]);
    const statistics = Statistics.load('1') as Statistics;
    const token0 = Token.load(pool.token0) as Token;
    const token1 = Token.load(pool.token1) as Token;

    const amount0 = divideByBase(event.params.amount0, token0.decimals);
    const amount1 = divideByBase(event.params.amount1, token1.decimals);
    const liquidity = divideByBase(event.params.amount);

    token0.txCount = token0.txCount.plus(BI_ONE);
    token0.totalLiquidity = token0.totalLiquidity.minus(amount0);
    token0.totalLiquidityUSD = token0.totalLiquidityUSD.minus(amount0.times(token0.derivedUSD));
    token0.totalLiquidityETH = token0.totalLiquidityETH.minus(amount0.times(token0.derivedETH));

    token1.txCount = token1.txCount.plus(BI_ONE);
    token1.totalLiquidity = token1.totalLiquidity.minus(amount1);
    token1.totalLiquidityUSD = token1.totalLiquidityUSD.minus(amount1.times(token1.derivedUSD));
    token1.totalLiquidityETH = token1.totalLiquidityETH.minus(amount1.times(token1.derivedETH));

    const amount0USD = amount0.times(token0.derivedUSD);
    const amount1USD = amount1.times(token1.derivedUSD);
    const amountTotalUSD = amount0USD.plus(amount1USD);
    const amount0ETH = amount0.times(token0.derivedETH);
    const amount1ETH = amount1.times(token1.derivedETH);
    const amountTotalETH = amount0ETH.plus(amount1ETH);

    const reserve0 = pool.reserve0.minus(amount0);
    const reserve1 = pool.reserve1.minus(amount1);
    const reserveETH = pool.reserveETH.minus(amountTotalETH);
    const reserveUSD = pool.reserveUSD.minus(amountTotalUSD);
    const totalSupply = pool.totalSupply.minus(liquidity);

    statistics.txCount = statistics.txCount.plus(BI_ONE);
    statistics.totalVolumeLockedETH = statistics.totalVolumeLockedETH.minus(amountTotalETH);
    statistics.totalVolumeLockedUSD = statistics.totalVolumeLockedUSD.minus(amountTotalUSD);

    pool.txCount = pool.txCount.plus(BI_ONE);
    pool.reserve0 = reserve0;
    pool.reserve1 = reserve1;
    pool.reserveETH = reserveETH;
    pool.reserveUSD = reserveUSD;
    pool.totalSupply = totalSupply;

    if (!pool.reserve1.equals(BD_ZERO)) pool.token0Price = pool.reserve0.times(pool.reserve1);
    else pool.token0Price = BD_ZERO;
    if (!pool.reserve0.equals(BD_ZERO)) pool.token1Price = pool.reserve1.times(pool.reserve0);
    else pool.token1Price = BD_ZERO;

    token0.save();
    token1.save();
    statistics.save();
    pool.save();

    const hash = event.transaction.hash.toHex();
    let transaction = Transaction.load(hash);

    if (transaction == null) {
        transaction = new Transaction(hash);
        transaction.block = event.block.number;
        transaction.timestamp = event.block.timestamp;
        transaction.hash = event.transaction.hash;
        transaction.save();
    }

    const burnId = `burn-${transaction.id}`;
    const burn = new Burn(burnId);
    burn.transaction = transaction.id;
    burn.timestamp = event.block.timestamp;
    burn.pool = pool.id;
    burn.sender = null;
    burn.to = event.params.owner;
    burn.amount0 = amount0;
    burn.amount1 = amount1;
    burn.liquidity = liquidity;
    burn.amountUSD = amount0USD.plus(amount1USD);
    burn.logIndex = event.logIndex;
    burn.save();

    updateOverallDayData(event);
    updatePoolDayData(event);
    updatePoolHourData(event);
    updateTokenDayData(token0, event);
    updateTokenDayData(token1, event);
}
