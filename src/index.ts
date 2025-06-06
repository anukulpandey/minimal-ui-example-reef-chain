import './polyfill';
import {flipIt, getFlipperValue} from "./flipperContract";
import {subscribeToBalance, toREEFBalanceNormal} from "./signerUtil";
import {getReefExtension} from "./extensionUtil";
import {Signer} from "@reef-chain/evm-provider";
import { extension as reefExt } from '@reef-chain/util-lib';
import {sendERC20Transfer, sendNativeREEFTransfer} from "./transferUtil";
import {isMainnet} from "@reef-chain/evm-provider";
import {getProviderFromUrl, initProvider} from "./providerUtil";

let selectedSigner: Signer;
let selSignerConnectedEVM: boolean;
let unsubBalance = () => {
};

document.addEventListener('bind-evm-address', async (evt: any) => {
    if (await isSelectedAddress(evt.detail as string, selectedSigner, 'Error connecting EVM. Selected signer is not the same.')) {
        bindEvm(selectedSigner);
    }
});

document.addEventListener('get-contract-value', async (evt: any) => {
    if (await isSelectedAddress(evt.detail as string, selectedSigner, 'Error getting contract value. Selected signer is not the same.')) {
        getContractValue(selectedSigner);
    }
});

document.addEventListener('toggle-contract-value', async (evt: any) => {
    if (await isSelectedAddress(evt.detail as string, selectedSigner, 'Error changing contract value. Selected signer is not the same.')) {
        toggleContractValue(selectedSigner);
    }
});

document.addEventListener('send-erc20', async (evt: any) => {
    sendERC20Transfer(evt.detail.amount, selectedSigner, evt.detail.to, evt.detail.contract).subscribe((val: any) => {
        // TODO display transaction status in UI
        console.log('TX =', val)
    }, (err) => console.log('TX ERC20 ERR=', err.message));
});

window.addEventListener('load',
    async () => {
        try {
            const extension = await getReefExtension('Minimal DApp Example') as reefExt.ReefInjected;

            // we can also get provider and signer
            // const prov = await extension.reefProvider.getNetworkProvider();
            // const signer = await extension.reefSigner.getSelectedSigner();
            // console.log("provider=",await prov.api.genesisHash.toString(), ' signer=',signer);

            const testRpcUrl = getProviderFromUrl();
            if (testRpcUrl) {
                console.log('test rpc=', testRpcUrl)

                let now = Date.now();
                const testProviderFromUrl = await initProvider(testRpcUrl);
                await testProviderFromUrl.api.isReadyOrError;
                console.log(`Provider ready in ${(Date.now() - now) / 1000} seconds`);
                now = Date.now();
                const evmNonce = await testProviderFromUrl.api.query.evm.accounts(
                    "0x6a816Ab55d0f161906886a7B9910938a03476a9F"
                );
                console.log(`EVM nonce fetched in ${(Date.now() - now) / 1000} seconds`);

                try {
                    console.log('calling author...');
                    await testProviderFromUrl.api.rpc.author.pendingExtrinsics()
                    console.log('check provider api');
                } catch (e) {
                    console.log('provider methods ok');
                }
            }

            extension.reefSigner.subscribeSelectedSigner(async (sig: reefExt.ReefSignerResponse) => {
                console.log("signer cb =", sig);
                try {
                    if (sig.status === reefExt.ReefSignerStatus.NO_ACCOUNT_SELECTED) {
                        throw new Error('Create account in Reef extension or make selected account visible.');
                    }
                    if (sig.status === reefExt.ReefSignerStatus.SELECTED_NO_VM_CONNECTION) {
                        throw new Error('Connect/bind selected account to Reef EVM.');
                    }
                    if (sig.data) {
                        console.log("signer connected to mainnet =", await isMainnet(sig.data));
                    }
                    setSelectedSigner(sig.data);
                } catch (err) {
                    displayError(err);
                }
            });
        } catch (e) {
            displayError(e);
        }
    });

async function isSelectedAddress(addr: string, selectedSigner: Signer, message: string) {
    const selAddr = await selectedSigner.getSubstrateAddress();
    if (addr !== selAddr) {
        displayError({message});
        return false;
    }
    return true;
}

function displayError(err) {
    document.dispatchEvent(new CustomEvent("display-error", {
        detail: err
    }));
}

function clearError() {
    document.dispatchEvent(new Event('clear-error'));
}

async function setSelectedSigner(sig) {
    selectedSigner = sig;
    unsubBalance();
    unsubBalance = await subscribeToBalance(sig, async (balFree) => await updateBalance(selectedSigner, balFree));
    let substrateAddress = await sig?.getSubstrateAddress();
    console.log("new signer=", substrateAddress);
    document.dispatchEvent(new CustomEvent('signer-change', {detail: substrateAddress}));
}

async function isEvmConnected(sig) {
    if (selSignerConnectedEVM) {
        return selSignerConnectedEVM;
    }
    selSignerConnectedEVM = await sig.isClaimed();
    return selSignerConnectedEVM;
}

async function updateBalance(sig, balFree) {
    let balanceNormal = toREEFBalanceNormal(balFree.toString());
    document.dispatchEvent(new CustomEvent('balance-value', {detail: balanceNormal}));

    var evmConnected = await isEvmConnected(sig);
    console.log("New SIGNER balance=", balanceNormal.toString(), ' EVM connected=', evmConnected);

    if (!evmConnected) {
        if (balanceNormal.lt('3')) {
            displayError('<p>To enable contract interaction you need to sign transaction with ~3REEF fee.<br/>To get 1000 testnet REEF simply type:<br/> <code>!drip ' + await sig.getSubstrateAddress() + '</code> <br/>in <a href="https://app.element.io/#/room/#reef:matrix.org" target="_blank">Reef matrix chat</a>. <br/>Listening on chain for balance update.</p>');
            return;
        }
    } else {
        document.dispatchEvent(new Event('evm-connected'));
    }
    clearError();
    document.dispatchEvent(new Event('dapp-connected'));
}

async function bindEvm(sig) {
    try {
        document.dispatchEvent(new Event('tx-progress'));
        await sig.claimDefaultAccount();
        document.dispatchEvent(new Event('tx-complete'));
        document.dispatchEvent(new Event('evm-connected'));
    } catch (e) {
        displayError(e);
    }
}

async function getContractValue(sig) {
    try {
        const ctrRes = await getFlipperValue(sig);
        document.dispatchEvent(new CustomEvent('contract-value', {detail: ctrRes}));
    } catch (e) {
        document.dispatchEvent(new CustomEvent('contract-value', {detail: e.message}));
    }
}

async function toggleContractValue(sig) {
    document.dispatchEvent(new Event('tx-progress'));
    try {
        var ctrRes = await flipIt(sig);
        console.log("flipped=", ctrRes);
        getContractValue(sig);
    } catch (e) {
        displayError(e);
    }
    document.dispatchEvent(new Event('tx-complete'));
}
