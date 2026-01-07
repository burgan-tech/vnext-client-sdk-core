<template>
  <div class="login">
    <h1>Login Examples</h1>
    
    <div class="auth-section">
      <h2>Device Auth</h2>
      <button @click="handleDeviceAuth" :disabled="loading">
        {{ loading ? 'Loading...' : 'Login with Device' }}
      </button>
      <p v-if="error" class="error">{{ error }}</p>
    </div>

    <div class="auth-section">
      <h2>1FA Auth</h2>
      <input v-model="username" placeholder="Username" />
      <input v-model="password" type="password" placeholder="Password" />
      <button @click="handle1FA" :disabled="loading">
        {{ loading ? 'Loading...' : 'Login with 1FA' }}
      </button>
    </div>

    <div class="auth-section">
      <h2>2FA Auth</h2>
      <input v-model="username2FA" placeholder="Username" />
      <input v-model="password2FA" type="password" placeholder="Password" />
      <input v-model="code2FA" placeholder="2FA Code" />
      <button @click="handle2FA" :disabled="loading">
        {{ loading ? 'Loading...' : 'Login with 2FA' }}
      </button>
    </div>

    <div v-if="isAuthenticated" class="success">
      <p>Authenticated as: {{ user?.username || user?.email }}</p>
      <p>Auth Type: {{ authType }}</p>
      <button @click="handleLogout">Logout</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useAuth } from '@vnext/vue';

const {
  isAuthenticated,
  authType,
  user,
  loading,
  error,
  loginWithDevice,
  loginWith1FA,
  loginWith2FA,
  logout,
} = useAuth();

const username = ref('');
const password = ref('');
const username2FA = ref('');
const password2FA = ref('');
const code2FA = ref('');

const handleDeviceAuth = async () => {
  await loginWithDevice({
    deviceId: 'example-device-' + Date.now(),
  });
};

const handle1FA = async () => {
  await loginWith1FA({
    username: username.value,
    password: password.value,
  });
};

const handle2FA = async () => {
  await loginWith2FA({
    username: username2FA.value,
    password: password2FA.value,
    code: code2FA.value,
    method: 'totp',
  });
};

const handleLogout = async () => {
  await logout();
};
</script>

<style scoped>
.login {
  max-width: 600px;
}

.auth-section {
  margin-bottom: 30px;
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.auth-section input {
  display: block;
  width: 100%;
  margin-bottom: 10px;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.auth-section button {
  padding: 10px 20px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.auth-section button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.error {
  color: red;
  margin-top: 10px;
}

.success {
  padding: 20px;
  background: #d4edda;
  border: 1px solid #c3e6cb;
  border-radius: 4px;
  margin-top: 20px;
}
</style>

