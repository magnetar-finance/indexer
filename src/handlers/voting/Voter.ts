import { Address } from '@graphprotocol/graph-ts';
import { log } from 'matchstick-as';
import {
    GaugeCreated as GaugeCreatedEvent,
    GaugeKilled as GaugeKilledEvent,
    GaugeRevived as GaugeRevivedEvent,
    Voted as VotedEvent,
} from '../../../generated/Voter/Voter';
import { Gauge, LockPosition, Pool, Token, VotingRewards } from '../../../generated/schema';
import { ERC20 } from '../../../generated/CLFactory/ERC20';
import { Gauge as GaugeContract } from '../../../generated/templates/Gauge/Gauge';
import { BD_ZERO, BI_ZERO } from '../../utils/constants';
import {
    CLGauge as CLGaugeTemplate,
    Gauge as GaugeTemplate,
    VotingReward as VotingRewardTemplate,
} from '../../../generated/templates';
import { divideByBase } from '../../utils/math';

export function handleGaugeCreated(event: GaugeCreatedEvent): void {
    const id = event.params.gauge.toHex();
    const poolAddress = event.params.pool;
    const poolId = poolAddress.toHex();
    log.info('[Voter] handleGaugeCreated — gauge: {}, pool: {}', [id, poolId]);
    const pool = Pool.load(poolId) as Pool;
    const gaugeContract = GaugeContract.bind(event.params.gauge);
    const rewardTokenResult = gaugeContract.try_rewardToken();
    if (rewardTokenResult.reverted) {
        log.warning('[Voter] rewardToken call reverted for gauge {}', [id]);
        return;
    }
    const rewardTokenAddress = rewardTokenResult.value;
    const rewardTokenId = rewardTokenAddress.toHex();
    let rewardToken = Token.load(rewardTokenId);

    if (rewardToken == null) {
        log.info('[Voter] Creating new reward token entity: {}', [rewardTokenId]);
        rewardToken = new Token(rewardTokenId);
        // Contract
        const contract = ERC20.bind(rewardTokenAddress);
        const symbol = contract.try_symbol();
        const decimals = contract.try_decimals();
        const name = contract.try_name();

        if (symbol.reverted || decimals.reverted || name.reverted) {
            log.warning('[Voter] Could not fetch reward token details for {}', [rewardTokenId]);
            return;
        }

        rewardToken.address = rewardTokenAddress;
        rewardToken.derivedETH = BD_ZERO;
        rewardToken.derivedUSD = BD_ZERO;
        rewardToken.decimals = decimals.value;
        rewardToken.symbol = symbol.value;
        rewardToken.name = name.value;
        rewardToken.totalLiquidity = BD_ZERO;
        rewardToken.totalLiquidityETH = BD_ZERO;
        rewardToken.totalLiquidityUSD = BD_ZERO;
        rewardToken.tradeVolume = BD_ZERO;
        rewardToken.tradeVolumeUSD = BD_ZERO;
        rewardToken.txCount = BI_ZERO;

        rewardToken.save();
    }

    const gauge = new Gauge(id);
    gauge.isAlive = true;
    gauge.depositPool = pool.id;
    gauge.address = event.params.gauge;
    gauge.bribeVotingReward = event.params.bribeVotingReward;
    gauge.feeVotingReward = event.params.feeVotingReward;
    gauge.emission = BD_ZERO;
    gauge.fees0 = BD_ZERO;
    gauge.fees1 = BD_ZERO;
    gauge.rewardRate = BD_ZERO;
    gauge.rewardToken = rewardToken.id;
    gauge.totalSupply = BD_ZERO;

    gauge.save();

    pool.gauge = gauge.id;
    pool.save();

    if (pool.poolType == 'CONCENTRATED') {
        CLGaugeTemplate.create(event.params.gauge);
    } else {
        GaugeTemplate.create(event.params.gauge);
    }
    log.info('[Voter] Gauge {} created for pool {} (type: {})', [id, poolId, pool.poolType]);

    // Voting rewards
    const feeVotingReward = new VotingRewards(gauge.feeVotingReward.toHex());
    feeVotingReward.votingRewardsType = 'FEE';
    feeVotingReward.gauge = gauge.id;
    feeVotingReward.save();

    const bribeVotingReward = new VotingRewards(gauge.bribeVotingReward.toHex());
    bribeVotingReward.votingRewardsType = 'BRIBE';
    bribeVotingReward.gauge = gauge.id;
    bribeVotingReward.save();

    VotingRewardTemplate.create(Address.fromBytes(gauge.feeVotingReward));
    VotingRewardTemplate.create(Address.fromBytes(gauge.bribeVotingReward));
}

export function handleGaugeKilled(event: GaugeKilledEvent): void {
    const gaugeId = event.params.gauge.toHex();
    log.info('[Voter] handleGaugeKilled — gauge: {}', [gaugeId]);
    const gauge = Gauge.load(gaugeId);
    if (gauge == null) return;
    gauge.isAlive = false;
    gauge.save();
}

export function handleGaugeRevived(event: GaugeRevivedEvent): void {
    const gaugeId = event.params.gauge.toHex();
    log.info('[Voter] handleGaugeRevived — gauge: {}', [gaugeId]);
    const gauge = Gauge.load(gaugeId);
    if (gauge == null) return;
    gauge.isAlive = true;
    gauge.save();
}

export function handleVoted(event: VotedEvent): void {
    log.info('[Voter] handleVoted — pool: {}, tokenId: {}, weight: {}', [
        event.params.pool.toHex(),
        event.params.tokenId.toString(),
        event.params.weight.toString(),
    ]);
    const pool = Pool.load(event.params.pool.toHex()) as Pool;
    const lock = LockPosition.load(event.params.tokenId.toString()) as LockPosition;
    const weight = divideByBase(event.params.weight);
    pool.totalVotes = pool.totalVotes.plus(weight);
    lock.totalVoteWeightGiven = lock.totalVoteWeightGiven.plus(weight);
    pool.save();
    lock.save();
}
