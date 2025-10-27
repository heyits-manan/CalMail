export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized") {
    super(message, 401);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = "Resource not found") {
    super(message, 404);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = "Bad request") {
    super(message, 400);
  }
}

export class GoogleAccountNotConnectedError extends NotFoundError {
  constructor() {
    super("Google account not connected.");
  }
}

export class TokenRefreshError extends UnauthorizedError {
  constructor(message: string = "Failed to refresh Google access token") {
    super(message);
  }
}

export class RecipientNotFoundError extends NotFoundError {
  constructor(recipientName: string) {
    super(
      `Could not find an email address for "${recipientName}". Please check your Google Contacts, email history, or say the full email address.`
    );
  }
}
