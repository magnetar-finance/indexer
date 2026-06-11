import { Address, dataSource } from '@graphprotocol/graph-ts';
import { log } from '@graphprotocol/graph-ts';
import { Oracle } from '../../generated/PoolFactory/Oracle';
import { Bundle, Token } from '../../generated/schema';
import { ORACLES, WETH, BD_ONE } from './constants';
import { divideByBase, multiplyByBase } from './math';

export function loadTokenPrice(token: Token): Token {
    const networkName = dataSource.network();
    const oracleAddress = ORACLES.get(networkName) as string;
    const oracle = Oracle.bind(Address.fromString(oracleAddress));

    log.info('Loading price for token {} through oracle {}', [token.id, oracleAddress]);

    const usdPriceCall = oracle.try_getAverageValueInUSD(
        Address.fromString(token.id),
        multiplyByBase(BD_ONE, token.decimals),
    );
    const ethPriceCall = oracle.try_getAverageValueInETH(
        Address.fromString(token.id),
        multiplyByBase(BD_ONE, token.decimals),
    );

    if (!usdPriceCall.reverted) {
        log.info('USD price for token {} is {}', [token.id, usdPriceCall.value.value0.toString()]);
        token.derivedUSD = divideByBase(usdPriceCall.value.value0);
    }

    if (!ethPriceCall.reverted) {
        log.info('ETH price for token {} is {}', [token.id, ethPriceCall.value.value0.toString()]);
        token.derivedETH = divideByBase(ethPriceCall.value.value0);
    }

    token.save();
    return token;
}

export function loadBundlePrice(): Bundle {
    const networkName = dataSource.network();
    const oracleAddress = ORACLES.get(networkName) as string;
    const oracle = Oracle.bind(Address.fromString(oracleAddress));

    const bundle = Bundle.load('1') as Bundle;
    const usdPriceCall = oracle.try_getAverageValueInUSD(
        Address.fromString(WETH.get(networkName) as string),
        multiplyByBase(BD_ONE),
    );

    if (!usdPriceCall.reverted) {
        bundle.ethPrice = divideByBase(usdPriceCall.value.value0);
    }

    bundle.save();
    return bundle;
}
