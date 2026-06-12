import { BigDecimal, BigInt, log } from '@graphprotocol/graph-ts';

export function divideByBase(a: BigInt, base: i32 = 18): BigDecimal {
    log.debug('[math] divideByBase — a: {}, base: {}', [a.toString(), base.toString()]);
    const numBD = a.toBigDecimal();
    const divisor = BigInt.fromI64(10 ** base).toBigDecimal();
    return numBD.div(divisor);
}

export function multiplyByBase(a: BigDecimal, base: i32 = 18): BigInt {
    log.debug('[math] multiplyByBase — a: {}, base: {}', [a.toString(), base.toString()]);
    const multiplier = BigInt.fromI64(10 ** base).toBigDecimal();
    return BigInt.fromString(a.times(multiplier).toString());
}
