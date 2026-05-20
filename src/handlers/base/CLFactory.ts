import { Address, BigInt } from '@graphprotocol/graph-ts';
import { log } from 'matchstick-as';
import { PoolCreated as V3PoolCreatedEvent } from '../../../generated/CLFactory/CLFactory';
import { Bundle, Pool, Statistics, Token } from '../../../generated/schema';
import { ERC20 } from '../../../generated/CLFactory/ERC20';
import { BD_ZERO, BI_ONE, BI_ZERO } from '../../utils/constants';
import { CLPool as CLPoolTemplate } from '../../../generated/templates';

export function handlePoolCreated(event: V3PoolCreatedEvent): void {
    const id = event.params.pool.toHex();
    const token0Id = event.params.token0.toHex();
    const token1Id = event.params.token1.toHex();
    log.info('[CLFactory] handlePoolCreated — pool: {}, token0: {}, token1: {}', [id, token0Id, token1Id]);
    let token0 = Token.load(token0Id);
    let token1 = Token.load(token1Id);
    let statistics = Statistics.load('1');
    let bundle = Bundle.load('1');

    if (statistics == null) {
        statistics = new Statistics('1');
        statistics.totalPairsCreated = BI_ZERO;
        statistics.totalVolumeLockedUSD = BD_ZERO;
        statistics.totalVolumeLockedETH = BD_ZERO;
        statistics.txCount = BI_ZERO;
        statistics.totalTradeVolumeETH = BD_ZERO;
        statistics.totalTradeVolumeUSD = BD_ZERO;
        statistics.totalFeesUSD = BD_ZERO;
        statistics.totalBribesUSD = BD_ZERO;
    }

    if (bundle == null) {
        bundle = new Bundle('1');
        bundle.ethPrice = BD_ZERO;
    }

    if (token0 == null) {
        log.info('[CLFactory] Creating new token0 entity: {}', [token0Id]);
        token0 = new Token(token0Id);
        // Contract
        const contract = ERC20.bind(Address.fromString(token0Id));
        const symbol = contract.try_symbol();
        const decimals = contract.try_decimals();
        const name = contract.try_name();

        if (symbol.reverted || decimals.reverted || name.reverted) {
            log.warning('[CLFactory] Could not fetch token0 details for {}', [token0Id]);
            return;
        }

        token0.address = Address.fromString(token0Id);
        token0.derivedETH = BD_ZERO;
        token0.derivedUSD = BD_ZERO;
        token0.decimals = decimals.value;
        token0.symbol = symbol.value;
        token0.name = name.value;
        token0.totalLiquidity = BD_ZERO;
        token0.totalLiquidityETH = BD_ZERO;
        token0.totalLiquidityUSD = BD_ZERO;
        token0.tradeVolume = BD_ZERO;
        token0.tradeVolumeUSD = BD_ZERO;
        token0.txCount = BI_ZERO;

        token0.save();
    }

    if (token1 == null) {
        log.info('[CLFactory] Creating new token1 entity: {}', [token1Id]);
        token1 = new Token(token1Id);
        // Contract
        const contract = ERC20.bind(Address.fromString(token1Id));
        const symbol = contract.try_symbol();
        const decimals = contract.try_decimals();
        const name = contract.try_name();

        if (symbol.reverted || decimals.reverted || name.reverted) {
            log.warning('[CLFactory] Could not fetch token1 details for {}', [token1Id]);
            return;
        }

        token1.address = Address.fromString(token1Id);
        token1.derivedETH = BD_ZERO;
        token1.derivedUSD = BD_ZERO;
        token1.decimals = decimals.value;
        token1.symbol = symbol.value;
        token1.name = name.value;
        token1.totalLiquidity = BD_ZERO;
        token1.totalLiquidityETH = BD_ZERO;
        token1.totalLiquidityUSD = BD_ZERO;
        token1.tradeVolume = BD_ZERO;
        token1.tradeVolumeUSD = BD_ZERO;
        token1.txCount = BI_ZERO;

        token1.save();
    }

    log.info('[CLFactory] Creating CL pool entity: {} ({}/{})', [id, token0.symbol, token1.symbol]);
    const pool = new Pool(id);
    pool.name = `CL-POS-${token0.symbol}/${token1.symbol}`;
    pool.address = Address.fromString(id);
    pool.token0 = token0.id;
    pool.token1 = token1.id;
    pool.createdAtBlockNumber = event.block.number;
    pool.createdAtTimestamp = event.block.timestamp;
    pool.gaugeFees0CurrentEpoch = BD_ZERO;
    pool.gaugeFees1CurrentEpoch = BD_ZERO;
    pool.gaugeFeesUSD = BD_ZERO;
    pool.totalFees0 = BD_ZERO;
    pool.totalFees1 = BD_ZERO;
    pool.totalFeesUSD = BD_ZERO;
    pool.totalBribesUSD = BD_ZERO;
    pool.txCount = BI_ZERO;
    pool.poolType = 'CONCENTRATED';
    pool.reserve0 = BD_ZERO;
    pool.reserve1 = BD_ZERO;
    pool.reserveETH = BD_ZERO;
    pool.reserveUSD = BD_ZERO;
    pool.token0Price = BD_ZERO;
    pool.token1Price = BD_ZERO;
    pool.totalEmissions = BD_ZERO;
    pool.totalEmissionsUSD = BD_ZERO;
    pool.totalSupply = BD_ZERO;
    pool.totalVotes = BD_ZERO;
    pool.volumeToken0 = BD_ZERO;
    pool.volumeToken1 = BD_ZERO;
    pool.volumeETH = BD_ZERO;
    pool.volumeUSD = BD_ZERO;
    pool.gauge = null;
    pool.tickSpacing = BigInt.fromI64(event.params.tickSpacing);

    statistics.totalPairsCreated = statistics.totalPairsCreated.plus(BI_ONE);

    pool.save();
    statistics.save();
    bundle.save();

    CLPoolTemplate.create(event.params.pool);
    log.info('[CLFactory] CL pool {} created and template instantiated. Total pairs: {}', [
        id,
        statistics.totalPairsCreated.toString(),
    ]);
}
