package ai.civicresolve.backend.service;

import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.regex.Pattern;

/**
 * Cryptographic service for generating, hashing, and verifying consumer tracking secrets.
 *
 * <p>Security properties:
 * <ul>
 *   <li>Tracking tokens contain 256 bits of entropy from {@link SecureRandom}.</li>
 *   <li>Tokens use URL-safe Base64 encoding prefixed with {@code trk_} (total length: 47 chars).</li>
 *   <li>Strict regex validation {@code ^trk_[A-Za-z0-9_-]{43}$} enforces token structure.</li>
 *   <li>Per-record 128-bit random salt prevents precomputation/rainbow-table attacks.</li>
 *   <li>Salted SHA-256 produces a 64-character hexadecimal digest.</li>
 *   <li>Verification uses {@link MessageDigest#isEqual(byte[], byte[])} for constant-time comparison.</li>
 *   <li>Plaintext tracking secrets are NEVER logged, serialized to persistent storage, or retained in memory.</li>
 * </ul>
 */
@Service
public class TrackingCryptoService {

    public static final String TOKEN_PREFIX = "trk_";
    public static final int TOKEN_ENTROPY_BYTES = 32; // 256 bits
    public static final int SALT_BYTES = 16;          // 128 bits

    private static final Pattern TOKEN_PATTERN = Pattern.compile("^trk_[A-Za-z0-9_-]{43}$");

    private static final String DUMMY_SALT = "00000000000000000000000000000000";
    private static final String DUMMY_SECRET = "trk_0000000000000000000000000000000000000000000";

    private final SecureRandom secureRandom = new SecureRandom();
    private final Base64.Encoder urlEncoder = Base64.getUrlEncoder().withoutPadding();
    private final HexFormat hexFormat = HexFormat.of();

    /**
     * Immutable value carrier for a newly generated tracking secret.
     * Contains the raw secret (to return once to the client) and the salted hash + salt (to persist).
     */
    public record GeneratedCredential(String rawSecret, String secretHash, String salt) {
        @Override
        public String toString() {
            // Defensively prevent accidental logging of rawSecret in toString() calls
            return "GeneratedCredential[rawSecret=[PROTECTED], secretHash=" + secretHash + ", salt=" + salt + "]";
        }
    }

    /**
     * Validates whether an incoming token string strictly matches the required format.
     *
     * @param token candidate token string
     * @return true if token conforms to {@code ^trk_[A-Za-z0-9_-]{43}$}, false otherwise
     */
    public boolean isValidTokenFormat(String token) {
        if (token == null) {
            return false;
        }
        return TOKEN_PATTERN.matcher(token).matches();
    }

    /**
     * Generates a new 256-bit cryptographically secure tracking secret, a 128-bit salt,
     * and the resulting salted SHA-256 hash.
     *
     * @return {@link GeneratedCredential} containing the raw secret, hash, and salt
     */
    public GeneratedCredential generateCredential() {
        // 1. Generate 256-bit raw token
        byte[] tokenBytes = new byte[TOKEN_ENTROPY_BYTES];
        secureRandom.nextBytes(tokenBytes);
        String rawSecret = TOKEN_PREFIX + urlEncoder.encodeToString(tokenBytes);

        // 2. Generate 128-bit salt
        byte[] saltBytes = new byte[SALT_BYTES];
        secureRandom.nextBytes(saltBytes);
        String saltHex = hexFormat.formatHex(saltBytes);

        // 3. Compute salted SHA-256 hash
        String secretHash = hashSecret(rawSecret, saltHex);

        return new GeneratedCredential(rawSecret, secretHash, saltHex);
    }

    /**
     * Computes the salted SHA-256 hash for a given tracking secret and salt.
     *
     * @param rawSecret raw tracking secret
     * @param saltHex hexadecimal salt string
     * @return 64-character lowercase hexadecimal SHA-256 hash
     */
    public String hashSecret(String rawSecret, String saltHex) {
        if (rawSecret == null || saltHex == null) {
            throw new IllegalArgumentException("rawSecret and saltHex must not be null");
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update(saltHex.getBytes(StandardCharsets.UTF_8));
            byte[] hashBytes = digest.digest(rawSecret.getBytes(StandardCharsets.UTF_8));
            return hexFormat.formatHex(hashBytes);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 algorithm must be available in JVM", e);
        }
    }

    /**
     * Verifies an incoming secret against a stored hash and salt using constant-time comparison.
     *
     * @param incomingSecret candidate tracking secret provided by the consumer
     * @param storedHash stored 64-character SHA-256 hash
     * @param storedSalt stored salt
     * @return true if the incoming secret matches the stored hash; false otherwise
     */
    public boolean verifySecret(String incomingSecret, String storedHash, String storedSalt) {
        if (!isValidTokenFormat(incomingSecret) || storedHash == null || storedSalt == null) {
            return false;
        }

        String computedHash = hashSecret(incomingSecret, storedSalt);
        byte[] computedBytes = computedHash.getBytes(StandardCharsets.UTF_8);
        byte[] storedBytes = storedHash.getBytes(StandardCharsets.UTF_8);

        return MessageDigest.isEqual(computedBytes, storedBytes);
    }

    /**
     * Best-effort timing equalization workload.
     *
     * <p>Executes a dummy salted SHA-256 computation when a referenced complaint does not exist,
     * mitigating timing differentials between missing cases and incorrect secrets.
     * Note: This is an engineering defense-in-depth mitigation, not a mathematical timing guarantee.
     */
    public void executeDummyHashWorkload() {
        hashSecret(DUMMY_SECRET, DUMMY_SALT);
    }
}
