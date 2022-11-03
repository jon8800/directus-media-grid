import { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';

export type APIError = {
	message: string;
	extensions: {
		code: string;
		[key: string]: any;
	};
};

interface RequestConfig extends AxiosRequestConfig {
	id: string;
}

interface Response extends AxiosResponse {
	config: RequestConfig;
}

export interface RequestError extends AxiosError {
	response: Response;
}