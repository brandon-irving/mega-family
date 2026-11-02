import { Platform } from 'react-native';
import * as googleSdk from '@react-native-google-signin/google-signin';
import { GOOGLE } from '@shared/config/google';
import { SCHEDULING } from '@shared/config/scheduling';
import { connectGoogle } from './googleConnect';
const { GoogleSignin } = googleSdk;
jest.mock('@react-native-google-signin/google-signin', () => ({
 GoogleSignin: { configure: jest.fn(), signOut: jest.fn().mockResolvedValue(null), hasPlayServices: jest.fn().mockResolvedValue(true), signIn: jest.fn().mockResolvedValue({ type: 'success', data: { serverAuthCode: 'test-code' } }) },
 isSuccessResponse: (r: {type:string}) => r.type === 'success', isErrorWithCode: () => false, statusCodes: {},
}));
afterEach(() => jest.restoreAllMocks());
test('native scheduling setup uses a single sign-in for Gmail, Calendar, holds and drafts',async()=>{
 jest.replaceProperty(Platform,'OS','ios');
 const googleConnectCode=jest.fn().mockResolvedValue({status:'connected'});
 const googleStart=jest.fn();
 expect(await connectGoogle(['gmail','googleCalendar'],{googleStart,googleConnectCode,loadGoogle:async()=>googleSdk} as never,true)).toBe('connected');
 expect(GoogleSignin.configure).toHaveBeenCalledWith(expect.objectContaining({scopes:[GOOGLE.scopes.gmail,GOOGLE.scopes.googleCalendar,SCHEDULING.scopes.calendar,SCHEDULING.scopes.drafts]}));
 expect(GoogleSignin.signIn).toHaveBeenCalledTimes(1);
 expect(googleConnectCode).toHaveBeenCalledWith({serverAuthCode:'test-code',want:['gmail','googleCalendar']});
 expect(googleStart).not.toHaveBeenCalled();
});

test('cleanup authorization explicitly requests Gmail modification in addition to existing scopes', async () => {
 jest.replaceProperty(Platform,'OS','ios');
 const googleConnectCode=jest.fn().mockResolvedValue({status:'connected'});
 await connectGoogle(['gmail','googleCalendar'],{googleStart:jest.fn(),googleConnectCode,loadGoogle:async()=>googleSdk} as never,true,true);
 expect(GoogleSignin.configure).toHaveBeenLastCalledWith(expect.objectContaining({scopes: expect.arrayContaining(['https://www.googleapis.com/auth/gmail.modify', SCHEDULING.scopes.calendar])}));
});
