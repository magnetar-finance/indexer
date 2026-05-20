import { Gauge, Token, User } from '../../../generated/schema';
import {
    CLGauge as GaugeContract,
    Deposit as DepositEvent,
    Withdraw as WithdrawEvent,
    NotifyReward as NotifyRewardEvent,
    ClaimRewards as ClaimRewardsEvent,
} from '../../../generated/templates/CLGauge/CLGauge';
import { divideByBase } from '../../utils/math';
import { createGaugePosition } from '../../utils/mutations';
import { log } from 'matchstick-as';

export function handleDeposit(event: DepositEvent): void {
    const gauge = Gauge.load(event.address.toHex()) as Gauge;
    const depositor = event.params.user;
    log.info('[CLGauge] handleDeposit — gauge: {}, user: {}, liquidity: {}', [
        event.address.toHex(),
        depositor.toHex(),
        event.params.liquidityToStake.toString(),
    ]);
    let user = User.load(depositor.toHex());

    if (user == null) {
        user = new User(depositor.toHex());
        user.address = depositor;
        user.save();
    }

    const amount = divideByBase(event.params.liquidityToStake);
    gauge.totalSupply = gauge.totalSupply.plus(amount);
    createGaugePosition(event, depositor, event.params.liquidityToStake);
}

export function handleWithdraw(event: WithdrawEvent): void {
    const gaugeId = event.address.toHex();
    const gauge = Gauge.load(gaugeId) as Gauge;
    log.info('[CLGauge] handleWithdraw — gauge: {}, user: {}, liquidity: {}', [
        gaugeId,
        event.params.user.toHex(),
        event.params.liquidityToStake.toString(),
    ]);
    const amount = divideByBase(event.params.liquidityToStake);
    gauge.totalSupply = gauge.totalSupply.minus(amount);
    gauge.save();
    createGaugePosition(event, event.params.user, event.params.liquidityToStake.neg());
}

export function handleNotifyReward(event: NotifyRewardEvent): void {
    const gaugeId = event.address.toHex();
    const gauge = Gauge.load(gaugeId) as Gauge;
    log.info('[CLGauge] handleNotifyReward — gauge: {}, amount: {}', [gaugeId, event.params.amount.toString()]);
    const token = Token.load(gauge.rewardToken) as Token;
    const amount = divideByBase(event.params.amount, token.decimals);
    const gaugeContract = GaugeContract.bind(event.address);
    const rate = gaugeContract.try_rewardRate();
    if (rate.reverted) {
        log.warning('[CLGauge] rewardRate call reverted for gauge {}', [gaugeId]);
        return;
    }
    const rewardRate = divideByBase(rate.value);
    gauge.rewardRate = rewardRate;
    gauge.emission = gauge.emission.plus(amount);
    gauge.save();
}

export function handleClaimRewards(event: ClaimRewardsEvent): void {
    const gaugeId = event.address.toHex();
    const gauge = Gauge.load(gaugeId) as Gauge;
    log.info('[CLGauge] handleClaimRewards — gauge: {}, amount: {}', [gaugeId, event.params.amount.toString()]);
    const token = Token.load(gauge.rewardToken) as Token;
    const amount = divideByBase(event.params.amount, token.decimals);
    gauge.emission = gauge.emission.minus(amount);
    gauge.save();
}
