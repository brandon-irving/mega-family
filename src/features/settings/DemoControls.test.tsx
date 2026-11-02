import { fireEvent, screen } from '@testing-library/react-native';
import { renderWithTheme } from '@/test/renderWithTheme';
import { useDemoProfile } from '@/data/useDemoProfile';
import { router } from '@/features/shell/navigation';
import { DemoControls } from './DemoControls';
jest.mock('@/data/useDemoProfile',()=>({useDemoProfile:jest.fn()}));
jest.mock('@/features/shell/navigation',()=>({router:{push:jest.fn()}}));
test('only one canonical demo entry remains',async()=>{(useDemoProfile as jest.Mock).mockReturnValue({profile:{active:false}});await renderWithTheme(<DemoControls memberId={'a' as never}/>);await fireEvent.press(screen.getByText('Open Demo Console'));expect(router.push).toHaveBeenCalledWith('/demo-console');expect(screen.queryByText('Start fresh admin demo')).toBeNull();});
test('not exposed when deployment/profile is not eligible',async()=>{(useDemoProfile as jest.Mock).mockReturnValue({profile:null});await renderWithTheme(<DemoControls memberId={'a' as never}/>);expect(screen.queryByText('Open Demo Console')).toBeNull();});
