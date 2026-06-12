import { log } from '@graphprotocol/graph-ts';
import { Rental, Token, User } from '../../../generated/schema';
import { NewRental as NewRentalEvent } from '../../../generated/VERentalMarketplace/VERentalMarketplace';
import { ERC20 } from '../../../generated/VERentalMarketplace/ERC20';
import { Address } from '@graphprotocol/graph-ts';
import { BD_ZERO, BI_ZERO } from '../../utils/constants';
import { divideByBase } from '../../utils/math';
import { VERental as VERentalTemplate } from '../../../generated/templates';

export function handleNewRental(event: NewRentalEvent): void {
    const rentalId = event.params.rental.toHex();
    const sellerId = event.transaction.from.toHex();

    let user = User.load(sellerId);

    if (user == null) {
        user = new User(sellerId);
        user.address = event.transaction.from;
        log.debug('[auto] saving entity: {}', ['user']);
        user.save();
    }

    const rental = new Rental(rentalId);
    rental.address = event.params.rental;
    rental.buyer = null;
    rental.escrow = event.params.escrow;
    rental.status = 'AVAILABLE';
    rental.seller = user.id;
    rental.reaped = false;
    rental.lock = event.params.tokenId.toString();
    rental.commission = BD_ZERO;

    const tokenId = event.params.paymentToken.toHex();
    let token = Token.load(tokenId);

    if (token == null) {
        log.info('[VERentalMarketplace] Creating new token entity: {}', [tokenId]);
        token = new Token(tokenId);
        // Contract
        const contract = ERC20.bind(Address.fromString(tokenId));
        const symbol = contract.try_symbol();
        const decimals = contract.try_decimals();
        const name = contract.try_name();

        if (symbol.reverted || decimals.reverted || name.reverted) {
            log.warning('[VERentalMarketplace] Could not fetch token details for {}', [tokenId]);
            return;
        }

        token.address = Address.fromString(tokenId);
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

        log.debug('[auto] saving entity: {}', ['token']);

        token.save();
    }

    rental.paymentToken = token.id;
    rental.price = divideByBase(event.params.price, token.decimals as i32);
    rental.runsUntil = event.block.timestamp.plus(event.params.duration);

    log.debug('[auto] saving entity: {}', ['rental']);

    rental.save();

    VERentalTemplate.create(event.params.rental);
}
