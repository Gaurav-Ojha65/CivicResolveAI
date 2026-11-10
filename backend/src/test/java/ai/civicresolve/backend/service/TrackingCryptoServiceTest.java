package ai.civicresolve.backend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@DisplayName("TrackingCryptoServiceTest — cryptographic token and hashing verification")
class TrackingCryptoServiceTest {

    private TrackingCryptoService cryptoService;

    @BeforeEach
    void setUp() {
        cryptoService = new TrackingCryptoService();
    }

    @Test
    @DisplayName("generateCredential produces 256-bit entropy token, 128-bit salt, and 64-char hex hash")
    void generateCredentialStructure() {
        TrackingCryptoService.GeneratedCredential cred = cryptoService.generateCredential();

        assertThat(cred).isNotNull();
        assertThat(cred.rawSecret()).isNotBlank();
        assertThat(cred.salt()).isNotBlank();
        assertThat(cred.secretHash()).isNotBlank();

        // Raw secret format: 'trk_' + 43 Base64URL chars = 47 chars
        assertThat(cred.rawSecret()).startsWith("trk_");
        assertThat(cred.rawSecret().length()).isEqualTo(47);
        assertThat(cryptoService.isValidTokenFormat(cred.rawSecret())).isTrue();

        // Salt: 16 bytes = 32 hex chars
        assertThat(cred.salt().length()).isEqualTo(32);
        assertThat(cred.salt()).matches("^[0-9a-f]{32}$");

        // Secret hash: SHA-256 = 32 bytes = 64 hex chars
        assertThat(cred.secretHash().length()).isEqualTo(64);
        assertThat(cred.secretHash()).matches("^[0-9a-f]{64}$");
    }

    @Test
    @DisplayName("generateCredential produces unique secrets and salts across invocations")
    void generateCredentialEntropy() {
        Set<String> secrets = new HashSet<>();
        Set<String> salts = new HashSet<>();

        for (int i = 0; i < 50; i++) {
            TrackingCryptoService.GeneratedCredential cred = cryptoService.generateCredential();
            secrets.add(cred.rawSecret());
            salts.add(cred.salt());
        }

        assertThat(secrets).hasSize(50);
        assertThat(salts).hasSize(50);
    }

    @Test
    @DisplayName("hashSecret is deterministic for identical secret and salt inputs")
    void hashSecretDeterministic() {
        TrackingCryptoService.GeneratedCredential cred = cryptoService.generateCredential();

        String hash1 = cryptoService.hashSecret(cred.rawSecret(), cred.salt());
        String hash2 = cryptoService.hashSecret(cred.rawSecret(), cred.salt());

        assertThat(hash1).isEqualTo(cred.secretHash());
        assertThat(hash1).isEqualTo(hash2);
    }

    @Test
    @DisplayName("hashSecret produces different hashes for different salts or secrets")
    void hashSecretDifferentInputs() {
        TrackingCryptoService.GeneratedCredential cred1 = cryptoService.generateCredential();
        TrackingCryptoService.GeneratedCredential cred2 = cryptoService.generateCredential();

        // Same secret, different salts
        String hashDifferentSalt = cryptoService.hashSecret(cred1.rawSecret(), cred2.salt());
        assertThat(hashDifferentSalt).isNotEqualTo(cred1.secretHash());

        // Different secrets, same salt
        String hashDifferentSecret = cryptoService.hashSecret(cred2.rawSecret(), cred1.salt());
        assertThat(hashDifferentSecret).isNotEqualTo(cred1.secretHash());
    }

    @Test
    @DisplayName("verifySecret returns true for matching credentials")
    void verifySecretSuccess() {
        TrackingCryptoService.GeneratedCredential cred = cryptoService.generateCredential();

        boolean result = cryptoService.verifySecret(cred.rawSecret(), cred.secretHash(), cred.salt());
        assertThat(result).isTrue();
    }

    @Test
    @DisplayName("verifySecret returns false for invalid secret, hash, or salt")
    void verifySecretMismatches() {
        TrackingCryptoService.GeneratedCredential cred = cryptoService.generateCredential();

        // Wrong secret
        String differentSecret = "trk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
        assertThat(cryptoService.verifySecret(differentSecret, cred.secretHash(), cred.salt())).isFalse();

        // Wrong hash
        String wrongHash = "0000000000000000000000000000000000000000000000000000000000000000";
        assertThat(cryptoService.verifySecret(cred.rawSecret(), wrongHash, cred.salt())).isFalse();

        // Wrong salt
        String wrongSalt = "ffffffffffffffffffffffffffffffff";
        assertThat(cryptoService.verifySecret(cred.rawSecret(), cred.secretHash(), wrongSalt)).isFalse();
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {
            "invalid_prefix_1234567890123456789012345678901234567890123",
            "trk_",
            "trk_tooShort",
            "trk_wayTooLong12345678901234567890123456789012345678901234567890",
            "trk_with+invalid/characters=padding12345678",
            "trk_with spaces in the token 1234567890123456",
            "TRK_UPPERCASEPREFIX1234567890123456789012345678901"
    })
    @DisplayName("isValidTokenFormat correctly rejects malformed tokens")
    void isValidTokenFormatRejections(String candidate) {
        assertThat(cryptoService.isValidTokenFormat(candidate)).isFalse();
        assertThat(cryptoService.verifySecret(candidate, "dummyHash", "dummySalt")).isFalse();
    }

    @Test
    @DisplayName("GeneratedCredential.toString() masks the raw secret to prevent accidental logging")
    void toStringMasksSecret() {
        TrackingCryptoService.GeneratedCredential cred = cryptoService.generateCredential();
        String str = cred.toString();

        assertThat(str).contains("[PROTECTED]");
        assertThat(str).doesNotContain(cred.rawSecret());
        assertThat(str).contains(cred.secretHash());
        assertThat(str).contains(cred.salt());
    }

    @Test
    @DisplayName("hashSecret throws IllegalArgumentException on null inputs")
    void hashSecretNullSafety() {
        assertThatThrownBy(() -> cryptoService.hashSecret(null, "salt"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> cryptoService.hashSecret("secret", null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("executeDummyHashWorkload runs cleanly without exceptions")
    void dummyWorkloadExecutesSafely() {
        cryptoService.executeDummyHashWorkload();
    }
}
