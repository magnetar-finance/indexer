import { ethereum, BigInt, Address } from '@graphprotocol/graph-ts';
import { log } from '@graphprotocol/graph-ts';
import {
    OverallDayData,
    PoolDayData,
    PoolHourData,
    Token,
    TokenDayData,
    Statistics,
    Pool,
    User,
    LiquidityPosition,
    Gauge,
    GaugePosition,
} from '../../generated/schema';
import { BD_ZERO, BI_ZERO, BI_ONE } from './constants';
import { divideByBase } from './math';

export function updateOverallDayData(event: ethereum.Event): OverallDayData {
    const statistics = Statistics.load('1') as Statistics;
    const timestamp = event.block.timestamp.toI32();
    const dayID = timestamp / 86400;
    const dayStartTimestamp = dayID * 86400;

    let overallDayData = OverallDayData.load(dayID.toString());
    if (overallDayData == null) {
        overallDayData = new OverallDayData(dayID.toString());
        overallDayData.feesUSD = BD_ZERO;
        overallDayData.date = dayStartTimestamp;
        overallDayData.txCount = BI_ZERO;
        overallDayData.volumeETH = BD_ZERO;
        overallDayData.volumeUSD = BD_ZERO;
    }
    overallDayData.liquidityUSD = statistics.totalVolumeLockedUSD;
    overallDayData.liquidityETH = statistics.totalVolumeLockedETH;
    overallDayData.totalTradeVolumeETH = statistics.totalTradeVolumeETH;
    overallDayData.totalTradeVolumeUSD = statistics.totalTradeVolumeUSD;
    overallDayData.txCount = overallDayData.txCount.plus(BI_ONE);

    log.debug('[mutations] updateOverallDayData — saving dayID: {}', [dayID.toString()]);
    overallDayData.save();

    return overallDayData as OverallDayData;
}

export function updatePoolDayData(event: ethereum.Event): PoolDayData {
    const timestamp = event.block.timestamp.toI32();
    const dayID = timestamp / 86400;
    const dayStartTimestamp = dayID * 86400;
    const dayPoolID = event.address.toHex().concat('-').concat(BigInt.fromI32(dayID).toString());
    const pool = Pool.load(event.address.toHex()) as Pool;
    let poolDayData = PoolDayData.load(dayPoolID);
    if (poolDayData == null) {
        poolDayData = new PoolDayData(dayPoolID);
        poolDayData.date = dayStartTimestamp;
        poolDayData.dailyTxns = BI_ZERO;
        poolDayData.dailyVolumeETH = BD_ZERO;
        poolDayData.dailyVolumeToken0 = BD_ZERO;
        poolDayData.dailyVolumeToken1 = BD_ZERO;
        poolDayData.dailyVolumeUSD = BD_ZERO;
        poolDayData.pool = pool.id;
    }
    poolDayData.totalSupply = pool.totalSupply;
    poolDayData.reserve0 = pool.reserve0;
    poolDayData.reserve1 = pool.reserve1;
    poolDayData.reserveUSD = pool.reserveUSD;
    poolDayData.reserveETH = pool.reserveETH;
    poolDayData.dailyTxns = poolDayData.dailyTxns.plus(BI_ONE);
    log.debug('[mutations] updatePoolDayData — saving dayPoolID: {}', [dayPoolID]);
    poolDayData.save();

    return poolDayData as PoolDayData;
}

export function updatePoolHourData(event: ethereum.Event): PoolHourData {
    const timestamp = event.block.timestamp.toI32();
    const hourIndex = timestamp / 3600;
    const hourStartUnix = hourIndex * 3600;
    const hourPoolID = event.address.toHex().concat('-').concat(BigInt.fromI32(hourIndex).toString());
    const pool = Pool.load(event.address.toHex()) as Pool;
    let poolHourData = PoolHourData.load(hourPoolID);
    if (poolHourData == null) {
        poolHourData = new PoolHourData(hourPoolID);
        poolHourData.hourStartUnix = hourStartUnix;
        poolHourData.pool = pool.id;
        poolHourData.hourlyVolumeToken0 = BD_ZERO;
        poolHourData.hourlyVolumeToken1 = BD_ZERO;
        poolHourData.hourlyVolumeUSD = BD_ZERO;
        poolHourData.hourlyTxns = BI_ZERO;
        poolHourData.hourlyVolumeETH = BD_ZERO;
    }
    poolHourData.totalSupply = pool.totalSupply;
    poolHourData.reserve0 = pool.reserve0;
    poolHourData.reserve1 = pool.reserve1;
    poolHourData.reserveUSD = pool.reserveUSD;
    poolHourData.reserveETH = pool.reserveETH;
    poolHourData.hourlyTxns = poolHourData.hourlyTxns.plus(BI_ONE);
    log.debug('[mutations] updatePoolHourData — saving hourPoolID: {}', [hourPoolID]);
    poolHourData.save();

    return poolHourData as PoolHourData;
}

export function updateTokenDayData(token: Token, event: ethereum.Event): TokenDayData {
    const timestamp = event.block.timestamp.toI32();
    const dayID = timestamp / 86400;
    const dayStartTimestamp = dayID * 86400;
    const tokenDayID = token.id.toString().concat('-').concat(BigInt.fromI32(dayID).toString());

    let tokenDayData = TokenDayData.load(tokenDayID);
    if (tokenDayData == null) {
        tokenDayData = new TokenDayData(tokenDayID);
        tokenDayData.date = dayStartTimestamp;
        tokenDayData.token = token.id;
        tokenDayData.dailyVolumeToken = BD_ZERO;
        tokenDayData.dailyVolumeETH = BD_ZERO;
        tokenDayData.dailyVolumeUSD = BD_ZERO;
        tokenDayData.dailyTxns = BI_ZERO;
    }
    tokenDayData.priceUSD = token.derivedUSD;
    tokenDayData.priceETH = token.derivedETH;
    tokenDayData.totalLiquidityToken = token.totalLiquidity;
    tokenDayData.totalLiquidityETH = token.totalLiquidity.times(token.derivedETH);
    tokenDayData.totalLiquidityUSD = token.totalLiquidity.times(token.derivedUSD);
    tokenDayData.dailyTxns = tokenDayData.dailyTxns.plus(BI_ONE);
    log.debug('[mutations] updateTokenDayData — saving tokenDayID: {}', [tokenDayID]);
    tokenDayData.save();

    return tokenDayData as TokenDayData;
}

export function createLPPosition(
    event: ethereum.Event,
    to: Address,
    amount: BigInt,
    tokenId: BigInt | null,
): LiquidityPosition {
    const poolId = event.address.toHex();
    const pool = Pool.load(poolId) as Pool;
    const userId = to.toHex();
    let user = User.load(userId);

    if (user == null) {
        user = new User(userId);
        user.address = to;
        log.debug('[mutations] createLPPosition — saving new User: {}', [userId]);
        user.save();
    }

    let positionId = userId + '-' + poolId;

    if (tokenId !== null) {
        positionId = positionId + '-' + tokenId.toString();
    }

    let position = LiquidityPosition.load(positionId);

    if (position == null) {
        log.debug('[mutations] Creating new LP position: {} for pool: {}', [positionId, poolId]);
        position = new LiquidityPosition(positionId);
        position.pool = pool.id;
        position.account = user.id;
        position.clPositionTokenId = tokenId;
        position.position = BD_ZERO;
        position.creationBlock = event.block.number;
        position.creationTransaction = event.transaction.hash;
    }

    position.position = divideByBase(amount, 18);
    log.debug('[mutations] createLPPosition — saving position: {}', [positionId]);
    position.save();
    return position;
}

export function createGaugePosition(event: ethereum.Event, to: Address, amount: BigInt): GaugePosition {
    const gaugeId = event.address.toHex();
    const gauge = Gauge.load(gaugeId) as Gauge;
    const userId = to.toHex();
    let user = User.load(userId);

    if (user == null) {
        user = new User(userId);
        user.address = to;
        log.debug('[mutations] createGaugePosition — saving new User: {}', [userId]);
        user.save();
    }

    const positionId = userId + '-' + gaugeId;
    let position = GaugePosition.load(positionId);

    if (position == null) {
        log.debug('[mutations] Creating new gauge position: {} for gauge: {}', [positionId, gaugeId]);
        position = new GaugePosition(positionId);
        position.gauge = gauge.id;
        position.account = user.id;
        position.amountDeposited = BD_ZERO;
        position.creationBlock = event.block.number;
        position.creationTransaction = event.block.hash;
    }

    position.amountDeposited = position.amountDeposited.plus(divideByBase(amount, 18));
    log.debug('[mutations] createGaugePosition — saving position: {}', [positionId]);
    position.save();
    return position;
}
