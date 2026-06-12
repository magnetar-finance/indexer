import { BD_ZERO, ZERO_ADDRESS } from '../../utils/constants';
import { divideByBase } from '../../utils/math';
import {
    Transfer as TransferEvent,
    IncreaseLiquidity as IncreaseLiquidityEvent,
    DecreaseLiquidity as DecreaseLiquidityEvent,
} from '../../../generated/NonfungiblePositionManager/NonfungiblePositionManager';
import { CLPosition, LiquidityPosition, User } from '../../../generated/schema';
import { getItemFromStorage, nullifyItem, setItemInStorage } from '../../utils/storage';
import { log } from '@graphprotocol/graph-ts';

export function handleTransfer(event: TransferEvent): void {
    const sender = event.params.from;
    const recipient = event.params.to;
    const isBurn = recipient.toHex() == ZERO_ADDRESS;
    const isTransfer = sender.toHex() != ZERO_ADDRESS && recipient.toHex() != ZERO_ADDRESS;
    const isMint = sender.toHex() == ZERO_ADDRESS;
    const tokenId = event.params.tokenId;
    log.info('[NFPM] handleTransfer — tokenId: {}, from: {}, to: {}, type: {}', [
        tokenId.toString(),
        sender.toHex(),
        recipient.toHex(),
        isMint ? 'MINT' : isBurn ? 'BURN' : 'TRANSFER',
    ]);
    let user = User.load(recipient.toHex());

    if (user == null) {
        user = new User(recipient.toHex());
        user.address = recipient;
        log.debug('[auto] saving entity: {}', ['user']);
        user.save();
    }

    const transactionId = event.transaction.hash.toHex();

    if (isMint) {
        setItemInStorage(transactionId, tokenId.toString()); // Transaction to token ID
        setItemInStorage(tokenId.toString(), user.id); // Token ID to user ID
        log.debug('Token ID set for transaction {}. New token ID {}.', [transactionId, tokenId.toString()]);
        return;
    }

    const clPosition = CLPosition.load(tokenId.toString()) as CLPosition;

    if (isTransfer) {
        log.info('[NFPM] Transfer — reassigning LP owner for tokenId: {}', [tokenId.toString()]);
        const lpId = event.address.toHex() + '-' + clPosition.pool + '-' + tokenId.toString();
        const lp = LiquidityPosition.load(lpId) as LiquidityPosition;
        lp.account = user.id;
        log.debug('[auto] saving entity: {}', ['lp']);
        lp.save();
    }

    if (isBurn) {
        log.info('[NFPM] Burn — clearing LP position for tokenId: {}', [tokenId.toString()]);
        const lpId = event.address.toHex() + '-' + clPosition.pool + '-' + tokenId.toString();
        const lp = LiquidityPosition.load(lpId) as LiquidityPosition;
        lp.account = null;
        lp.position = BD_ZERO;
        log.debug('[auto] saving entity: {}', ['lp']);
        lp.save();
    }
}

export function handleIncreaseLiquidity(event: IncreaseLiquidityEvent): void {
    const tokenId = event.params.tokenId;
    log.info('[NFPM] handleIncreaseLiquidity — tokenId: {}, liquidity: {}', [
        tokenId.toString(),
        event.params.liquidity.toString(),
    ]);
    const clPosition = CLPosition.load(tokenId.toString());

    if (clPosition == null) {
        setItemInStorage(`new-liquidity:${tokenId.toString()}`, event.params.liquidity.toString());
        log.warning('[NFPM] handleIncreaseLiquidity — CLPosition not found for tokenId: {}', [tokenId.toString()]);
        return;
    }

    const lpId = event.address.toHex() + '-' + clPosition.pool + '-' + tokenId.toString();
    const lp = LiquidityPosition.load(lpId) as LiquidityPosition;
    const amount = divideByBase(event.params.liquidity);

    lp.position = lp.position.plus(amount);
    log.debug('[auto] saving entity: {}', ['lp']);
    lp.save();
}

export function handleDecreaseLiquidity(event: DecreaseLiquidityEvent): void {
    const tokenId = event.params.tokenId;
    log.info('[NFPM] handleDecreaseLiquidity — tokenId: {}, liquidity: {}', [
        tokenId.toString(),
        event.params.liquidity.toString(),
    ]);
    const clPosition = CLPosition.load(tokenId.toString()) as CLPosition;
    const lpId = event.address.toHex() + '-' + clPosition.pool + '-' + tokenId.toString();
    const lp = LiquidityPosition.load(lpId) as LiquidityPosition;
    const amount = divideByBase(event.params.liquidity);

    lp.position = lp.position.minus(amount);
    log.debug('[auto] saving entity: {}', ['lp']);
    lp.save();
}
