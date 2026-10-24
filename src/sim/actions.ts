// Player commands. Each takes the current state and returns a new state or an
// error message for the player; the input state is never mutated.

export { type ActionResult } from './commands/core';
export { renameCompany, setLook, readMessage, readAllMessages, research } from './commands/company';
export { buildRoom, reshapeRoom, joinRooms, releaseRoom, setRoomType, renameRoom, placeFurniture, rotateFurniture, moveFurniture, sellFurniture, storeFurniture, placeStored, sellStored, upgradeEquipment, upgradeCost } from './commands/office';
export { hire, sendOnTraining, sendToTalentProgramme, promote, fire, callMeeting, setMonthlyMeeting, setMeetingMinutes, callChannelMeeting, setMonthlyChannelMeeting, setChannelMeetingMinutes, endStrike, assignDesk, seatGroup, matchPoachOffer, declinePoachOffer, grantRaise, declineRaise, poachHost, hireTemp, endTemp } from './commands/staff';
export { placeRightsBid, withdrawRightsBid, buyLicense, dropLicense, type ChannelInput, createChannel, closeChannel, updateChannel, setChannelManager } from './commands/channels';
export { type ShowInput, createShow, updateShow, deleteShow, revampShow, scheduleShow, setShowTone, settleCase } from './commands/shows';
export { acceptOffer, cancelContract, declineOffer, titlePrice, rightsPrice, airingPrice, buyTitle, buyRecords, recordsPrice, discardTitle, buyRights, placeBid, withdrawBid } from './commands/content';
export { type CampaignInput, startCampaign, openSocialAccount, closeSocialAccount, extendCampaign, setCampaignRepeat, stopCampaign, stageEvent } from './commands/marketing';
export { openStreaming, setStreamingPrice, closeStreaming, takeLoan, repayLoan } from './commands/money';
