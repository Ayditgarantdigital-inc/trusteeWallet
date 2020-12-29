/**
 * @version 0.30
 */
import React from 'react'
import { ThemeContext } from '../theme/ThemeProvider'
import firebase from 'react-native-firebase'
import { Dimensions, Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native'
import Header from '../../components/elements/new/Header'
import config from '../../config/config'
import ListItem from '../../components/elements/new/list/ListItem/Setting'
import NavStore from '../../components/navigation/NavStore'
import { AppWalletConnect } from '../../services/Back/AppWalletConnect/AppWalletConnect'
import Log from '../../services/Log/Log'
import { showModal } from '../../appstores/Stores/Modal/ModalActions'
import LetterSpacing from '../../components/elements/LetterSpacing'
import BlocksoftPrettyStrings from '../../../crypto/common/BlocksoftPrettyStrings'
import BlocksoftUtils from '../../../crypto/common/BlocksoftUtils'
import BlocksoftPrettyNumbers from '../../../crypto/common/BlocksoftPrettyNumbers'
import EthNetworkPrices from '../../../crypto/blockchains/eth/basic/EthNetworkPrices'

class WalletConnectScreen extends React.Component {

    state = {
        headerHeight: 0,
        walletStarted: false,
        chainId: false,
        peerMeta: {
            name: '',
            url: '',
            description: '',
            icons: []
        },
        peerId: false,
        peerStatus: false,
        accounts: [],
        transactions: []
    }

    componentDidMount() {

        // when usual open (moved from unsafe)
        this.init()

        // when back by history
        this._onFocusListener = this.props.navigation.addListener('didFocus', (payload) => {
            this.init()
        })
    }

    async init() {
        Log.log('WalletConnectScreen.init')
        const data = this.props.navigation.getParam('walletConnect')
        try {
            const clientData = await AppWalletConnect.init(data,
                this.handleSessionRequest,
                this.handleSessionEnd,
                this.handleSendTransaction,
                this.handleSendSign,
                this.handleSendSignTyped
            )
            const stateData = {
                walletStarted: true,
                peerStatus: clientData.connected,
                chainId: clientData.chainId,
                accounts: clientData.accounts
            }
            if (typeof clientData.peerMeta !== 'undefined' && clientData.peerMeta  && clientData.peerMeta !== '') {
                stateData.peerMeta = clientData.peerMeta
            }
            if (typeof clientData.peerId !== 'undefined' && clientData.peerId && clientData.peerId !== '') {
                stateData.peerId = clientData.peerId
            }
            this.setState(stateData)
        } catch (e) {
            if (config.debug.appErrors) {
                Log.log('WalletConnect.init error ' + e.message)
            }
            Log.err('WalletConnect.init error ' + e.message)
            this.setState({
                walletStarted: false
            })
        }
    }

    handleUserStatus = async (isConnected) => {
        if (isConnected) {
            showModal({
                type: 'YES_NO_MODAL',
                icon: 'INFO',
                title: 'Wallet Connect Stop',
                description: 'Do you want to stop this session?'
            }, async () => {
                await AppWalletConnect.killSession()
                this.setState({
                    peerStatus: false
                })
            })
        } else {
            showModal({
                type: 'YES_NO_MODAL',
                icon: 'INFO',
                title: 'Wallet Connect Start',
                description: 'Do you want to start this session?'
            }, async () => {
                await AppWalletConnect.approveSession()
                await this.init()
            })
        }
    }

    handleSendTransaction = async (data, payload) => {
        let value = 0
        let decimals = 0
        let txPrice = 0
        try {
            decimals = BlocksoftUtils.hexToDecimalWalletConnect(data.value)
            value = BlocksoftPrettyNumbers.setCurrencyCode('ETH').makePretty(decimals)
        } catch (e) {
            Log.log('WalletConnectScreen.handleSendTransaction value/decimals error ' + e.message)
        }
        try {
            let gasPrice = 0
            if (typeof data.gasPrice !== 'undefined') {
                gasPrice = BlocksoftUtils.hexToDecimalWalletConnect(data.gasPrice)
            }
            if (gasPrice * 1 <= 0) {
                const prices = await EthNetworkPrices.get(data.from)
                gasPrice = prices.speed_blocks_2
            }
            const gas = BlocksoftUtils.hexToDecimalWalletConnect(data.gas)
            txPrice = BlocksoftPrettyNumbers.setCurrencyCode('ETH').makePretty(BlocksoftUtils.mul(gasPrice, gas))
        } catch (e) {
            Log.log('WalletConnectScreen.handleSendTransaction txPrice error ' + e.message)
        }
        let subtitle
        if (typeof data.data === 'undefined' || !data.data || data.data === '' || data.data === '0x') {
            subtitle = 'send ' + value + ' ETH to ' + data.to
        } else {
            let message = BlocksoftPrettyStrings.makeCut(data.data, 10, 10)
            try {
                const tmp = BlocksoftUtils.hexToUtf(data.data)
                if (tmp !== '') {
                    message = tmp
                }
            } catch (e) {

            }
            if (value.toString() === '0') {
                subtitle = 'send data ' + message + ' to ' + data.to
            } else {
                subtitle = 'send ' + value + ' ETH with data ' + message + ' to ' + data.to
            }
        }
        showModal({
            type: 'YES_NO_MODAL',
            icon: 'INFO',
            title: 'Wallet Connect Transaction Request',
            description: 'Do you want ' + subtitle + ' (max tx cost: ' + txPrice + ' ETH)',
            noCallback: async () => {
                await AppWalletConnect.rejectRequest(payload)
            }
        }, async () => {
            const transaction = await AppWalletConnect.approveRequest(data, payload)
            transaction.subtitle = subtitle
            const transactions = this.state.transactions
            transactions.push(transaction)
            this.setState({
                transactions: transactions
            })
        })

    }

    handleSendSign = (message, payload) => {

        showModal({
            type: 'YES_NO_MODAL',
            icon: 'INFO',
            title: 'Wallet Connect Sign Request',
            description: 'Do you want to sign message ' + message,
            noCallback: async () => {
                await AppWalletConnect.rejectRequest(payload)
            }
        }, async () => {
            await AppWalletConnect.approveSign(message, payload)
        })
    }

    handleSendSignTyped = (data, payload) => {

        showModal({
            type: 'YES_NO_MODAL',
            icon: 'INFO',
            title: 'Wallet Connect Sign Typed Request',
            description: 'Do you want to sign message ' + JSON.stringify(data),
            noCallback: async () => {
                await AppWalletConnect.rejectRequest(payload)
            }
        }, async () => {
            await AppWalletConnect.approveSignTyped(data, payload)
        })
    }

    handleSessionEnd = () => {
        this.setState({
            peerStatus: false
        })
    }

    handleSessionRequest = (data) => {
        let title = '?'
        try {
            title = data.peerMeta.name + ' ' + data.peerMeta.url
        } catch (e) {
            Log.err('WalletConnectScreen.handleSessionRequest title error ' + e.message)
        }
        showModal({
            type: 'YES_NO_MODAL',
            icon: 'INFO',
            title: 'Wallet Connect Session Request',
            description: 'Do you want to connect to ' + title,
            noCallback: async () => {
                await AppWalletConnect.rejectSession()
                NavStore.goBack()
            }
        }, async () => {
            AppWalletConnect.approveSession()
            this.setState({
                peerMeta : data.peerMeta,
                peerId : data.peerId,
                peerStatus : true
            })
        })
    }

    setHeaderHeight = (height) => {
        const headerHeight = Math.round(height || 0)
        this.setState(() => ({ headerHeight }))
    }

    handleBack = async () => {
        AppWalletConnect.killSession()
        NavStore.goBack()
    }

    handleClose = async () => {
        AppWalletConnect.killSession()
        NavStore.reset('DashboardStack')
    }


    render() {
        firebase.analytics().setCurrentScreen('WalletConnect')

        const { colors, GRID_SIZE, isLight } = this.context
        const { headerHeight } = this.state

        return (
            <View style={[styles.container, { backgroundColor: colors.common.background }]}>
                <Header
                    leftType='back'
                    leftAction={this.handleBack}
                    rightType='close'
                    rightAction={this.handleClose}
                    title={'Wallet Connect'}
                    setHeaderHeight={this.setHeaderHeight}
                />
                <SafeAreaView style={[styles.content, {
                    backgroundColor: colors.common.background,
                    marginTop: headerHeight
                }]}>
                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.scrollViewContent}
                        keyboardShouldPersistTaps='handled'
                    >
                        <View style={{ marginTop: 20, marginHorizontal: 20 }}>

                            {
                                this.state.walletStarted ?
                                    <ListItem
                                        title={'Wallet Connect'}
                                        subtitle={this.state.peerId ? this.state.peerId : 'wait for session request or rescan QR code'}
                                        iconType='pinCode'
                                    /> : <ListItem
                                        title={'Wallet Connect error'}
                                        subtitle={'rescan QR code'}
                                        iconType='pinCode'
                                    />
                            }

                            {
                                this.state.peerId && typeof this.state.peerMeta !== 'undefined' ?
                                    <ListItem
                                        title={this.state.peerMeta.name !== 'undefined' ? this.state.peerMeta.name : ''}
                                        subtitle={typeof this.state.peerMeta.url !== 'undefined' ? this.state.peerMeta.url : ''}
                                        iconType='pinCode'
                                    /> : null
                            }
                            {
                                this.state.peerId ?
                                    <View style={{ paddingTop: 10, paddingBottom: 15, flexDirection: 'row' }}>
                                        <View style={{ paddingLeft: 50, paddingRight: 5, flex: 2 }}>
                                            <View style={{ ...styles.buttonHeader, backgroundColor: colors.accountScreen.trxButtonBackgroundColor, borderColor: colors.accountScreen.trxButtonBorderColor }}>
                                                <LetterSpacing text={this.state.peerStatus ? 'Connected' : 'Disconnected'} letterSpacing={0.5} numberOfLines={2}
                                                               textStyle={{ color: colors.common.text1 }} />
                                            </View>
                                        </View>
                                        <View style={{ paddingLeft: 5, paddingRight: 15, flex: 2 }}>
                                            <View style={{ ...styles.buttonHeader, backgroundColor: colors.accountScreen.trxButtonBackgroundColor, borderColor: colors.accountScreen.trxButtonBorderColor }}>
                                                <TouchableOpacity onPress={() => this.handleUserStatus(this.state.peerStatus)}>
                                                    <LetterSpacing text={this.state.peerStatus ? 'Press to Stop' : ''} letterSpacing={0.5} numberOfLines={2}
                                                                   textStyle={{ color: colors.common.text1 }} />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    </View> : null
                            }

                            {
                                this.state.accounts && this.state.accounts.length > 0 ?
                                    <ListItem
                                        title={BlocksoftPrettyStrings.makeCut(this.state.accounts[0], 10, 8)}
                                        subtitle={'Change wallet to use another address'}
                                        iconType='pinCode'
                                    /> : null
                            }

                            {
                                this.state.transactions ?
                                    this.state.transactions.map((item, index) => {
                                        return <ListItem
                                            key={index}
                                            title={BlocksoftPrettyStrings.makeCut(item.transactionHash, 10, 8)}
                                            subtitle={item.subtitle}
                                            onPress={() => {
                                            }}
                                        />
                                    })
                                    : null
                            }

                        </View>
                    </ScrollView>
                </SafeAreaView>
            </View>
        )
    }
}

WalletConnectScreen.contextType = ThemeContext
export default WalletConnectScreen


const styles = StyleSheet.create({
    container: {
        flex: 1
    },
    content: {
        flex: 1
    },
    scrollViewContent: {
        flexGrow: 1
    }
})