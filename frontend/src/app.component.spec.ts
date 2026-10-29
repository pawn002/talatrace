import { AppComponent } from './app.component';
import { ElectronService } from './services/electron.service';
import { ToastService } from './services/toast.service';

describe('notification preference selection', () => {
  function setup(value: number) {
    const toast = { timeoutSeconds: value, setTimeoutSeconds: jest.fn() };
    const component = new AppComponent({} as ElectronService, toast as unknown as ToastService);
    const select = document.createElement('select');
    for (const option of ['0', '5', '10', '30']) select.add(new Option(option, option));
    return { component, toast, select };
  }
  it('restores Never after AT deselects it instead of leaving a blank field', () => {
    const { component, toast, select } = setup(0);
    select.selectedIndex = -1;
    component.onNotificationTimeout({ target: select } as unknown as Event);
    expect(select.value).toBe('0'); expect(toast.setTimeoutSeconds).not.toHaveBeenCalled();
  });
  it('applies a supported selected timeout', () => {
    const { component, toast, select } = setup(10);
    select.value = '30'; component.onNotificationTimeout({ target: select } as unknown as Event);
    expect(toast.setTimeoutSeconds).toHaveBeenCalledWith(30);
  });
});
