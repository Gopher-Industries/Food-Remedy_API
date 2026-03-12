import { Pressable, ScrollView, View, Modal, Image, Alert, ActivityIndicator } from "react-native";
import { useState, useEffect } from "react";
import * as ImagePicker from 'expo-image-picker';
import Tt from "@/components/ui/UIText";
import IconGeneral from "@/components/icons/IconGeneral";
import { color, spacing } from "@/app/design/token";
import { useAuth } from "@/components/providers/AuthProvider";
import { useNotification } from "@/components/providers/NotificationProvider";
import getUserProfileName from "@/services/database/user/getUserProfileName";
import { deleteProfileAvatar, getProfileAvatarDownloadUrl, uploadProfileAvatar } from "@/services/storage/uploadProfileAvatar";

interface ProfilePhotoEditModalProps {
  visible: boolean;
  onClose: () => void;
  onPhotoUpdated?: () => void;
  userName?: string; // Optional prop to receive updated name from parent
  profileId?: string | null;
}

export default function ProfilePhotoEditModal({ visible, onClose, onPhotoUpdated, userName, profileId }: ProfilePhotoEditModalProps) {
  const { user } = useAuth();
  const { addNotification } = useNotification();
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [name, setName] = useState("");
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Fetch user name and profile photo from Firebase
  // Refetch whenever modal becomes visible or userName prop changes
  useEffect(() => {
    const fetchUserData = async () => {
      if (user?.uid && visible) {
        // Use prop userName if provided, otherwise fetch from Firebase
        if (userName) {
          setName(userName);
        } else {
          const profileName = await getUserProfileName(user.uid);
          if (profileName) {
            const fullName = `${profileName.firstName || ''} ${profileName.lastName || ''}`.trim() || profileName.userName || '';
            setName(fullName);
          }
        }

        // Fetch existing profile photo from Storage
        try {
          if (!profileId) return;
          const url = await getProfileAvatarDownloadUrl(user.uid, profileId);
          setProfileImage(url);
        } catch {
          // No photo URL yet, that's fine
        }
      }
    };
    
    fetchUserData();
  }, [user, visible, userName]);

  const uploadAndSavePhoto = async (uri: string) => {
    if (!user?.uid) {
      addNotification('User not authenticated', 'e');
      return;
    }
    if (!profileId) {
      addNotification('Profile not ready yet', 'e');
      return;
    }

    setIsUploading(true);
    try {
      // Upload to Firebase Storage (use 'Self' as profileId for user's own photo)
      const downloadUrl = await uploadProfileAvatar(user.uid, profileId, uri);
      setProfileImage(downloadUrl);
      addNotification('Profile photo updated successfully', 's');
      // Notify parent to refresh
      if (onPhotoUpdated) {
        await onPhotoUpdated();
      }
    } catch (error: any) {
      console.error('Error uploading photo:', error);
      const errorMessage = error?.message || 'Failed to upload photo. Please try again.';
      addNotification(errorMessage, 'e');
      Alert.alert('Upload Error', errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const handleTakePhoto = async () => {
    try {
      // Request camera permissions
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Camera permission is required to take photos.');
        return;
      }

      // Launch camera
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadAndSavePhoto(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  const handleChooseFromGallery = async () => {
    try {
      // Request media library permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Gallery access permission is required to choose photos.');
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadAndSavePhoto(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error choosing photo:', error);
      Alert.alert('Error', 'Failed to choose photo. Please try again.');
    }
  };

  const handleRemovePhoto = async () => {
    if (!user?.uid || !profileId) return;

    setIsUploading(true);
    try {
      await deleteProfileAvatar(user.uid, profileId);
      setProfileImage(null);
      setShowRemoveDialog(false);
      addNotification('Profile photo removed', 's');
      // Notify parent to refresh
      if (onPhotoUpdated) {
        await onPhotoUpdated();
      }
    } catch (error) {
      console.error('Error removing photo:', error);
      addNotification('Failed to remove photo', 'e');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1" style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}>
        <View className="flex-1 mt-20 px-8 justify-start">
          <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        {/* Profile Photo Card */}
        <View className="bg-[#CCCCCC] rounded-lg p-6 overflow-hidden">
          {/* Header with Title and Close Icon */}
          <View className="flex-row items-center justify-between">
            <Tt className="text-xl font-interMedium">Profile Photo</Tt>
            <Pressable
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {({ pressed }) => (
                <View className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: pressed ? "rgba(255, 63, 181, 0.1)" : "transparent" }}>
                  <IconGeneral
                    type="close"
                    fill={pressed ? color.primary : "hsl(0, 0%, 50%)"}
                    size={spacing.lg}
                  />
                </View>
              )}
            </Pressable>
          </View>

          {/* White Divider */}
          <View className="h-px bg-white mb-6 mt-3" />

          {/* Circle Avatar */}
          <View className="items-center mb-6">
            <View className="w-40 h-40 rounded-full bg-white flex items-center justify-center border-2 border-hsl90 overflow-hidden">

              {isUploading ? (
                <ActivityIndicator size="large" color={color.primary} />
              ) : profileImage ? (
                <Image source={{ uri: profileImage }} className="w-full h-full" resizeMode="cover" />
              ) : (
                <IconGeneral type="account" fill="hsl(0 0% 40%)" size={100} />
              )}
            </View>
          </View>

          {/* User Name */}
          <View className="items-center mb-12">
            <View className="bg-white px-6 py-2 rounded-2xl">
              <Tt className="text-black text-[16px] font-thin">{name || "Loading..."}</Tt>
            </View>
          </View>

          {/* Take Photo Button */}
          <Pressable
            onPress={handleTakePhoto}
            disabled={isUploading}
            className="flex-row items-center justify-center py-3 px-4 rounded-lg mb-3"
            style={{ backgroundColor: isUploading ? "#999" : "#13A97A" }}
          >
            {({ pressed }) => (
              <>
                
                <IconGeneral type="camera" fill="white" size={24} />
                <Tt className="text-white font-interMedium ml-2">Take Photo</Tt>
              </>
            )}
          </Pressable>

          {/* Choose from Gallery Button */}
          <Pressable
            onPress={handleChooseFromGallery}
            disabled={isUploading}
            className="flex-row items-center justify-center py-3 px-4 rounded-lg mb-3"
            style={{ backgroundColor: isUploading ? "#999" : "#fff" }}
          >
            {({ pressed }) => (
              <>
                <IconGeneral type="image" fill="hsl(0, 0%, 30%)" size={24} />
                <Tt className="text-black font-interMedium ml-2">Choose from Gallery</Tt>
              </>
            )}
          </Pressable>

          {/* Remove Photo Button */}
          <Pressable
            onPress={() => setShowRemoveDialog(true)}
            className="flex-row items-center justify-center py-3 px-4 rounded-lg mb-16"
            style={{ backgroundColor: color.primary }}
          >
            {({ pressed }) => (
              <>
                <IconGeneral type="delete" fill="white" size={24} />
                <Tt className="text-white font-interMedium ml-2">Remove Photo</Tt>
              </>
            )}
          </Pressable>

          {/* Cancel Button */}
          <Pressable
            onPress={onClose}
            className="flex-row items-center justify-center py-3 px-4 rounded-lg"
            style={{ backgroundColor: "#333333" }}
          >
            {({ pressed }) => (
              <Tt className="text-white font-interMedium">Cancel</Tt>
            )}
          </Pressable>
        </View>
      </ScrollView>

      {/* Remove Photo Alert Dialog */}
      <Modal
        visible={showRemoveDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRemoveDialog(false)}
      >
        <View className="flex-1 flex items-center justify-center" style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}>
          <View className="bg-gray-300 rounded-2xl p-6 w-[75%] max-w-xs" style={{ backgroundColor: "#CCCCCC" }}>
            {/* Bin Icon */}
            <View className="items-center mb-4">
              <View className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: color.primary }}>
                <IconGeneral type="delete" fill="white" size={spacing.xl} />
              </View>
            </View>

            {/* Title */}
            <Tt className="text-center text-lg font-interBold mb-6">
              Remove Profile Photo?
            </Tt>

            {/* Buttons */}
            <View className="flex-row gap-3">
              {/* Cancel Button */}
              <Pressable
                onPress={() => setShowRemoveDialog(false)}
                className="flex-1 py-2 px-4 rounded-lg"
                style={{ backgroundColor: "#333333" }}
              >
                {({ pressed }) => (
                  <Tt className="text-center font-interMedium text-white">
                    Cancel
                  </Tt>
                )}
              </Pressable>

              {/* Remove Button */}
              <Pressable
                onPress={handleRemovePhoto}
                className="flex-1 py-2 px-4 rounded-lg"
                style={{ backgroundColor: color.primary }}
              >
                {({ pressed }) => (
                  <Tt className="text-center font-interMedium text-white">
                    Remove
                  </Tt>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
        </View>
      </View>
    </Modal>
  );
}
