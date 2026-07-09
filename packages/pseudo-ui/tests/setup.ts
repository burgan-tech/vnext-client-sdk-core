import { config } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'

// PrimeVue + ToastService for components that need them
config.global.plugins = [PrimeVue, ToastService]
