const axios = require('axios');
const logger = require('./logger');

class HttpClient {
  constructor() {
    this.baseURL = '';
    this.headers = {};
    this.axiosInstance = null;
    this.initAxios();
  }

  // 初始化axios实例
  initAxios() {
    this.axiosInstance = axios.create({
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    this.setupInterceptors();
  }

  // 设置拦截器
  setupInterceptors() {
    // 清除现有拦截器
    this.axiosInstance.interceptors.request.clear();
    this.axiosInstance.interceptors.response.clear();

    // 请求拦截器
    this.axiosInstance.interceptors.request.use(
      (config) => {
        logger.debug('HTTP Request', {
          method: config.method,
          url: config.url,
          data: config.data
        });
        return config;
      },
      (error) => {
        logger.error('HTTP Request Error', { error: error.message });
        return Promise.reject(error);
      }
    );

    // 响应拦截器
    this.axiosInstance.interceptors.response.use(
      (response) => {
        logger.debug('HTTP Response', {
          status: response.status,
          url: response.config.url,
          data: response.data
        });
        return response;
      },
      (error) => {
        logger.error('HTTP Response Error', {
          status: error.response?.status,
          url: error.config?.url,
          message: error.message,
          data: error.response?.data
        });
        return Promise.reject(error);
      }
    );
  }

  // 更新配置
  updateConfig(baseURL, headers) {
    this.baseURL = baseURL;
    this.headers = headers;
    
    // 重新创建axios实例
    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...this.headers
      }
    });

    // 重新设置拦截器
    this.setupInterceptors();
    /*
    logger.info('HTTP Client配置已更新', {
      baseURL: this.baseURL,
      headersCount: Object.keys(this.headers).length
    });
    */
  }

  // GET请求
  async get(endpoint, params = {}) {
    try {
      const response = await this.axiosInstance.get(endpoint, { params });
      return response.data;
    } catch (error) {
      logger.error('GET请求失败', {
        endpoint,
        params,
        error: error.message
      });
      throw error;
    }
  }

  // POST请求
  async post(endpoint, data = {}) {
    try {
      const response = await this.axiosInstance.post(endpoint, data);
      return response.data;
    } catch (error) {
      logger.error('POST请求失败', {
        endpoint,
        data,
        error: error.message
      });
      throw error;
    }
  }

  // PUT请求
  async put(endpoint, data = {}) {
    try {
      const response = await this.axiosInstance.put(endpoint, data);
      return response.data;
    } catch (error) {
      logger.error('PUT请求失败', {
        endpoint,
        data,
        error: error.message
      });
      throw error;
    }
  }

  // DELETE请求
  async delete(endpoint, data = {}) {
    try {
      const response = await this.axiosInstance.delete(endpoint, data);
      return response.data;
    } catch (error) {
      logger.error('PUT请求失败', {
        endpoint,
        data,
        error: error.message
      });
      throw error;
    }
  }


  // 检查配置是否有效
  isConfigured() {
    return this.baseURL && Object.keys(this.headers).length > 0;
  }
}

module.exports = HttpClient;