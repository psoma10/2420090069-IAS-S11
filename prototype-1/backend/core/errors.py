"""Application error hierarchy.

Every expected failure in CyberVault is raised as an :class:`AppError`
subclass carrying an HTTP status and a stable machine-readable code. A single
Flask error handler turns these into the failure envelope described in
API_CONTRACT.md section 1, so routes never build error responses by hand.

Anything that is *not* an AppError is a bug: the handler logs it with a
traceback and returns a generic INTERNAL_ERROR, so internal paths and stack
traces never reach the client.
"""

from __future__ import annotations


class AppError(Exception):
    """Base class for every expected, client-visible failure."""

    status_code: int = 400
    code: str = "INTERNAL_ERROR"
    message: str = "An unexpected error occurred"

    def __init__(self, message: str | None = None, *, code: str | None = None,
                 status_code: int | None = None) -> None:
        self.message = message or self.__class__.message
        if code is not None:
            self.code = code
        if status_code is not None:
            self.status_code = status_code
        super().__init__(self.message)

    def to_dict(self) -> dict:
        return {"success": False, "message": self.message, "error": {"code": self.code}}


class ValidationError(AppError):
    status_code = 400
    code = "VALIDATION_ERROR"
    message = "The request contained invalid data"


class UnauthorizedError(AppError):
    status_code = 401
    code = "UNAUTHORIZED"
    message = "Authentication required"


class InvalidCredentialsError(AppError):
    status_code = 401
    code = "INVALID_CREDENTIALS"
    message = "Invalid email or password"


class EmailTakenError(AppError):
    status_code = 409
    code = "EMAIL_TAKEN"
    message = "An account with this email already exists"


class InvalidFileTypeError(AppError):
    status_code = 400
    code = "INVALID_FILE_TYPE"
    message = "Only human-readable .txt files are supported by this prototype"


class EmptyFileError(AppError):
    status_code = 400
    code = "EMPTY_FILE"
    message = "The uploaded file is empty"


class FileTooLargeError(AppError):
    status_code = 413
    code = "FILE_TOO_LARGE"
    message = "The uploaded file exceeds the maximum allowed size"


class DocumentNotFoundError(AppError):
    status_code = 404
    code = "DOCUMENT_NOT_FOUND"
    message = "Document not found"


class TransferNotFoundError(AppError):
    status_code = 404
    code = "TRANSFER_NOT_FOUND"
    message = "Transfer not found"


class UnsupportedAlgorithmError(AppError):
    status_code = 400
    code = "UNSUPPORTED_ALGORITHM"
    message = "Unsupported encryption algorithm"


class InvalidKeyError(AppError):
    status_code = 400
    code = "INVALID_KEY"
    message = "The supplied key is not valid for this algorithm"


class EncryptionFailedError(AppError):
    status_code = 500
    code = "ENCRYPTION_FAILED"
    message = "The document could not be encrypted"


class DecryptionFailedError(AppError):
    status_code = 400
    code = "DECRYPTION_FAILED"
    message = "The supplied key could not successfully decrypt this document"


class TransferFailedError(AppError):
    status_code = 500
    code = "TRANSFER_FAILED"
    message = "The transfer could not be completed"


class InvalidStateError(AppError):
    status_code = 409
    code = "INVALID_STATE"
    message = "The requested operation is not valid in the current state"


class ServerUnavailableError(AppError):
    status_code = 503
    code = "SERVER_UNAVAILABLE"
    message = "Unable to establish connection"


class InternalError(AppError):
    status_code = 500
    code = "INTERNAL_ERROR"
    message = "An unexpected error occurred"
