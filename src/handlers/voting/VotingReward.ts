import { log } from 'matchstick-as';
import { ERC20 } from '../../../generated/CLFactory/ERC20';
import { Gauge, Pool, Statistics, Token, VotingRewards } from '../../../generated/schema';
import {
    NotifyReward as NotifyRewardEvent,
    ClaimRewards as ClaimRewardsEvent,
} from '../../../generated/templates/VotingReward/VotingReward';
import { BD_ZERO, BI_ZERO } from '../../utils/constants';
import { divideByBase } from '../../utils/math';
import { loadTokenPrice } from '../../utils/misc';

export function handleNotifyReward(event: NotifyRewardEvent): void {
    const votingReward = VotingRewards.load(event.address.toHex()) as VotingRewards;
    const gauge = Gauge.load(votingReward.gauge) as Gauge;
    const pool = Pool.load(gauge.depositPool) as Pool;
    log.info('[VotingReward] handleNotifyReward — address: {}, reward: {}, amount: {}', [
        event.address.toHex(),
        event.params.reward.toHex(),
        event.params.amount.toString(),
    ]);
    let token = Token.load(event.params.reward.toHex());

    if (token == null) {
        token = new Token(event.params.reward.toHex());
        // Contract
        const contract = ERC20.bind(event.params.reward);
        const symbol = contract.try_symbol();
        const decimals = contract.try_decimals();
        const name = contract.try_name();

        if (symbol.reverted || decimals.reverted || name.reverted) {
            log.warning('[VotingReward] Could not fetch reward token details for {}', [event.params.reward.toHex()]);
            return;
        }

        token.address = event.params.reward;
        token.derivedETH = BD_ZERO;
        token.derivedUSD = BD_ZERO;
        token.decimals = decimals.value;
        token.symbol = symbol.value;
        token.name = name.value;
        token.totalLiquidity = BD_ZERO;
        token.totalLiquidityETH = BD_ZERO;
        token.totalLiquidityUSD = BD_ZERO;
        token.tradeVolume = BD_ZERO;
        token.tradeVolumeUSD = BD_ZERO;
        token.txCount = BI_ZERO;

        token.save();
    }

    token = loadTokenPrice(token);

    const amount = divideByBase(event.params.amount, token.decimals);
    const amountUSD = amount.times(token.derivedUSD);
    const amountETH = amount.times(token.derivedETH);

    const isFee = votingReward.votingRewardsType == 'FEE';
    const isCL = pool.poolType == 'CONCENTRATED';
    log.debug('[VotingReward] NotifyReward classification — type: {}, poolType: {}, amountUSD: {}', [
        isFee ? 'FEE' : 'BRIBE',
        pool.poolType,
        amountUSD.toString(),
    ]);
    const statistics = Statistics.load('1') as Statistics;

    if (isFee) {
        const isToken0 = token.id == pool.token0;
        const reserve0 = isToken0 ? pool.reserve0.minus(amount) : pool.reserve0;
        const reserve1 = !isToken0 ? pool.reserve1.minus(amount) : pool.reserve1;
        const gaugeFees0CurrentEpoch = isToken0
            ? pool.gaugeFees0CurrentEpoch.plus(amount)
            : pool.gaugeFees0CurrentEpoch;
        const gaugeFees1CurrentEpoch = !isToken0
            ? pool.gaugeFees1CurrentEpoch.plus(amount)
            : pool.gaugeFees1CurrentEpoch;
        const gaugeFeesUSD = pool.gaugeFeesUSD.plus(amountUSD);
        const totalFees0 = isToken0 && isCL ? pool.totalFees0.plus(amount) : pool.totalFees0;
        const totalFees1 = !isToken0 && isCL ? pool.totalFees1.plus(amount) : pool.totalFees1;
        const totalFeesUSD = isCL ? pool.totalFeesUSD.plus(amountUSD) : pool.totalFeesUSD;

        pool.reserve0 = reserve0;
        pool.reserve1 = reserve1;
        pool.gaugeFees0CurrentEpoch = gaugeFees0CurrentEpoch;
        pool.gaugeFees1CurrentEpoch = gaugeFees1CurrentEpoch;
        pool.gaugeFeesUSD = gaugeFeesUSD;
        pool.totalFees0 = totalFees0;
        pool.totalFees1 = totalFees1;
        pool.totalFeesUSD = totalFeesUSD;
        pool.reserveUSD = pool.reserveUSD.minus(amountUSD);
        pool.reserveETH = pool.reserveETH.minus(amountETH);

        gauge.fees0 = gaugeFees0CurrentEpoch;
        gauge.fees1 = gaugeFees1CurrentEpoch;

        if (isCL) statistics.totalFeesUSD = statistics.totalFeesUSD.plus(amountUSD);
    } else {
        pool.totalBribesUSD = pool.totalBribesUSD.plus(amountUSD);
        statistics.totalBribesUSD = statistics.totalBribesUSD.plus(amountUSD);
    }

    pool.save();
    gauge.save();
    statistics.save();
}

export function handleClaimRewards(event: ClaimRewardsEvent): void {
    const votingReward = VotingRewards.load(event.address.toHex()) as VotingRewards;
    const gauge = Gauge.load(votingReward.gauge) as Gauge;
    const pool = Pool.load(gauge.depositPool) as Pool;
    log.info('[VotingReward] handleClaimRewards — address: {}, reward: {}, amount: {}', [
        event.address.toHex(),
        event.params.reward.toHex(),
        event.params.amount.toString(),
    ]);
    let token = Token.load(event.params.reward.toHex()) as Token;

    token = loadTokenPrice(token);

    const amount = divideByBase(event.params.amount, token.decimals);
    const amountUSD = amount.times(token.derivedUSD);

    const isFee = votingReward.votingRewardsType == 'FEE';
    const isCL = pool.poolType == 'CONCENTRATED';
    const statistics = Statistics.load('1') as Statistics;

    if (isFee) {
        const isToken0 = token.id == pool.token0;
        const gaugeFees0CurrentEpoch = isToken0
            ? pool.gaugeFees0CurrentEpoch.minus(amount)
            : pool.gaugeFees0CurrentEpoch;
        const gaugeFees1CurrentEpoch = !isToken0
            ? pool.gaugeFees1CurrentEpoch.minus(amount)
            : pool.gaugeFees1CurrentEpoch;
        const gaugeFeesUSD = pool.gaugeFeesUSD.minus(amountUSD);
        const totalFees0 = isToken0 && isCL ? pool.totalFees0.minus(amount) : pool.totalFees0;
        const totalFees1 = !isToken0 && isCL ? pool.totalFees1.minus(amount) : pool.totalFees1;
        const totalFeesUSD = isCL ? pool.totalFeesUSD.minus(amountUSD) : pool.totalFeesUSD;

        pool.gaugeFees0CurrentEpoch = gaugeFees0CurrentEpoch;
        pool.gaugeFees1CurrentEpoch = gaugeFees1CurrentEpoch;
        pool.gaugeFeesUSD = gaugeFeesUSD;
        pool.totalFees0 = totalFees0;
        pool.totalFees1 = totalFees1;
        pool.totalFeesUSD = totalFeesUSD;

        gauge.fees0 = gaugeFees0CurrentEpoch;
        gauge.fees1 = gaugeFees1CurrentEpoch;

        statistics.totalFeesUSD = statistics.totalFeesUSD.minus(amountUSD);
    } else {
        pool.totalBribesUSD = pool.totalBribesUSD.minus(amountUSD);
        statistics.totalBribesUSD = statistics.totalBribesUSD.minus(amountUSD);
    }

    pool.save();
    gauge.save();
    statistics.save();
}
