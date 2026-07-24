<script setup lang="ts">
import LoginModal from '~/components/modal/Login.vue';

const modal = useDialog();

onMounted(() => {
  // 清除旧的 auth-key cookie，避免使用过期 token
  document.cookie = 'auth-key=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';

  modal.open(LoginModal);
});
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8">
      <div>
        <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
          微信文章导出
        </h2>
        <p class="mt-2 text-center text-sm text-gray-600">
          请使用微信扫码登录
        </p>
      </div>

      <div class="mt-8 bg-blue-50 border border-blue-200 rounded-md p-4">
        <div class="flex">
          <div class="flex-shrink-0">
            <svg class="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
            </svg>
          </div>
          <div class="ml-3">
            <h3 class="text-sm font-medium text-blue-800">
              登录说明
            </h3>
            <div class="mt-2 text-sm text-blue-700">
              <p>1. 点击下方按钮打开微信登录二维码</p>
              <p>2. 使用微信扫描二维码</p>
              <p>3. 在手机上确认登录</p>
              <p>4. 登录成功后自动跳转</p>
            </div>
          </div>
        </div>
      </div>

      <div class="flex justify-center">
        <button
          @click="modal.open(LoginModal)"
          class="w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
        >
          扫码登录
        </button>
      </div>
    </div>
  </div>
</template>
