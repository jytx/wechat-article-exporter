/**
 * 封装 $fetch 无重试请求
 * 自动携带 cookie，确保登录状态能正确传递
 */
export const request = $fetch.create({
  retry: 0,
  method: 'GET',
  credentials: 'include', // 重要：自动携带 cookie
  async onResponse({ request, response, options, error }) {
    // 需要注意的是，这里有可能是客户端和服务器端调用
  },
  async onResponseError({ request, response, options, error }) {},
});
